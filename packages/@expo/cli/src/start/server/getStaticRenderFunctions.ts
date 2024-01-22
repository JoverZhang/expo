/**
 * Copyright © 2022 650 Industries.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import fs from 'fs';
import fetch from 'node-fetch';
import path from 'path';
import requireString from 'require-from-string';
import resolveFrom from 'resolve-from';

import { logMetroError } from './metro/metroErrorInterface';
import { getMetroServerRoot } from './middleware/ManifestMiddleware';
import { createBundleUrlPath } from './middleware/metroOptions';
import { stripAnsi } from '../../utils/ansi';
import { delayAsync } from '../../utils/delay';
import { SilentError } from '../../utils/errors';
import { memoize } from '../../utils/fn';
import { profile } from '../../utils/profile';

const debug = require('debug')('expo:start:server:node-renderer') as typeof console.log;

function wrapBundle(str: string) {
  // Skip the metro runtime so debugging is a bit easier.
  // Replace the __r() call with an export statement.
  // Use gm to apply to the last require line. This is needed when the bundle has side-effects.
  return str.replace(/^(__r\(.*\);)$/gm, 'module.exports = $1');
}

// TODO(EvanBacon): Group all the code together and version.
const getRenderModuleId = (
  projectRoot: string,
  entry: string = 'expo-router/node/render.js'
): string => {
  const moduleId = resolveFrom.silent(projectRoot, entry);
  if (!moduleId) {
    throw new Error(
      `A version of expo-router with Node.js support is not installed in the project.`
    );
  }

  return moduleId;
};

type StaticRenderOptions = {
  // Ensure the style format is `css-xxxx` (prod) instead of `css-view-xxxx` (dev)
  dev?: boolean;
  minify?: boolean;
  platform?: string;
  environment?: 'node';
  engine?: 'hermes';
  baseUrl: string;
  isReactServer?: boolean;
  routerRoot: string;
};

const moveStaticRenderFunction = memoize(async (projectRoot: string, requiredModuleId: string) => {
  // Copy the file into the project to ensure it works in monorepos.
  // This means the file cannot have any relative imports.
  const tempDir = path.join(projectRoot, '.expo/static');
  await fs.promises.mkdir(tempDir, { recursive: true });
  const moduleId = path.join(tempDir, 'render.js');
  await fs.promises.writeFile(moduleId, await fs.promises.readFile(requiredModuleId, 'utf8'));
  // Sleep to give watchman time to register the file.
  await delayAsync(50);
  return moduleId;
});

/** @returns the js file contents required to generate the static generation function. */
async function getStaticRenderFunctionsContentAsync(
  projectRoot: string,
  devServerUrl: string,
  {
    dev = false,
    minify = false,
    environment,
    baseUrl,
    routerRoot,
    isReactServer,
    engine,
    platform,
  }: StaticRenderOptions,
  entry?: string
): Promise<{ src: string; filename: string }> {
  const root = getMetroServerRoot(projectRoot);
  const requiredModuleId = getRenderModuleId(root, entry);
  let moduleId = requiredModuleId;

  // Cannot be accessed using Metro's server API, we need to move the file
  // into the project root and try again.
  if (path.relative(root, moduleId).startsWith('..')) {
    moduleId = await moveStaticRenderFunction(projectRoot, requiredModuleId);
  }

  return requireFileContentsWithMetro(root, devServerUrl, moduleId, {
    dev,
    minify,
    environment,
    baseUrl,
    routerRoot,
    isReactServer,
    engine,
    platform,
  });
}

async function ensureFileInRootDirectory(projectRoot: string, otherFile: string) {
  // Cannot be accessed using Metro's server API, we need to move the file
  // into the project root and try again.
  if (!path.relative(projectRoot, otherFile).startsWith('..' + path.sep)) {
    return otherFile;
  }

  // Copy the file into the project to ensure it works in monorepos.
  // This means the file cannot have any relative imports.
  const tempDir = path.join(projectRoot, '.expo/static-tmp');
  await fs.promises.mkdir(tempDir, { recursive: true });
  const moduleId = path.join(tempDir, path.basename(otherFile));
  await fs.promises.writeFile(moduleId, await fs.promises.readFile(otherFile, 'utf8'));
  // Sleep to give watchman time to register the file.
  await delayAsync(50);
  return moduleId;
}

export async function createMetroEndpointAsync(
  projectRoot: string,
  devServerUrl: string,
  absoluteFilePath: string,
  {
    dev = false,
    platform = 'web',
    minify = false,
    environment,
    engine = 'hermes',
    baseUrl,
    isReactServer,
    routerRoot,
  }: StaticRenderOptions
): Promise<string> {
  const root = getMetroServerRoot(projectRoot);
  const safeOtherFile = await ensureFileInRootDirectory(projectRoot, absoluteFilePath);
  const serverPath = path.relative(root, safeOtherFile).replace(/\.[jt]sx?$/, '');

  const urlFragment = createBundleUrlPath({
    platform,
    mode: dev ? 'development' : 'production',
    mainModuleName: serverPath,
    engine,
    environment,
    lazy: false,
    minify,
    baseUrl,
    isExporting: true,
    rsc: isReactServer,
    asyncRoutes: false,
    routerRoot,
  });

  const url = new URL(urlFragment.replace(/^\//, ''), devServerUrl).toString();
  debug('fetching from Metro:', root, serverPath, url);
  return url;
}

class MetroNodeError extends Error {
  constructor(
    message: string,
    public rawObject: any
  ) {
    super(message);
  }
}

export async function requireFileContentsWithMetro(
  projectRoot: string,
  devServerUrl: string,
  absoluteFilePath: string,
  props: StaticRenderOptions
): Promise<{ src: string; filename: string }> {
  const url = await createMetroEndpointAsync(projectRoot, devServerUrl, absoluteFilePath, props);

  return { src: await metroFetchAsync(url), filename: url };
}

export async function metroFetchAsync(url: string): Promise<string> {
  const res = await fetch(url);

  // TODO: Improve error handling
  if (res.status === 500) {
    const text = await res.text();
    if (text.startsWith('{"originModulePath"') || text.startsWith('{"type":"TransformError"')) {
      const errorObject = JSON.parse(text);

      throw new MetroNodeError(stripAnsi(errorObject.message) ?? errorObject.message, errorObject);
    }
    throw new Error(`[${res.status}]: ${res.statusText}\n${text}`);
  }

  if (!res.ok) {
    throw new Error(`Error fetching bundle for static rendering: ${res.status} ${res.statusText}`);
  }

  const content = await res.text();

  return wrapBundle(content);
}

export async function getStaticRenderFunctions(
  projectRoot: string,
  devServerUrl: string,
  options: StaticRenderOptions
): Promise<Record<string, (...args: any[]) => Promise<any>>> {
  return getStaticRenderFunctionsForEntry(
    projectRoot,
    devServerUrl,
    options,
    'expo-router/node/render.js'
  );
}
export async function getStaticRenderFunctionsForEntry(
  projectRoot: string,
  devServerUrl: string,
  options: StaticRenderOptions,
  entry: string
): Promise<Record<string, (...args: any[]) => Promise<any>>> {
  const { src: scriptContents, filename } = await getStaticRenderFunctionsContentAsync(
    projectRoot,
    devServerUrl,
    options,
    entry
  );

  return evalMetroAndWrapFunctions(projectRoot, scriptContents, filename);
}

function evalMetroAndWrapFunctions<T = Record<string, (...args: any[]) => Promise<any>>>(
  projectRoot: string,
  script: string,
  filename: string
): Promise<T> {
  // console.log(script);
  const contents = evalMetro(script, filename);

  // wrap each function with a try/catch that uses Metro's error formatter
  return Object.keys(contents).reduce((acc, key) => {
    const fn = contents[key];
    if (typeof fn !== 'function') {
      return { ...acc, [key]: fn };
    }

    acc[key] = async function (...props: any[]) {
      try {
        return await fn.apply(this, props);
      } catch (error: any) {
        console.error('Err:', error);
        await logMetroError(projectRoot, { error });
        throw new SilentError(error);
      }
    };
    return acc;
  }, {} as any);
}

export function evalMetro(src: string, filename: string) {
  return profile(requireString, 'eval-metro-bundle')(src, filename);
}
