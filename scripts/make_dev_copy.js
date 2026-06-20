/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-07-13
 * @FilePath     : /scripts/make_dev_copy.js
 * @LastEditTime : 2025-07-13
 * @Description  : Copy plugin files to SiYuan plugins directory instead of creating symbolic links
 */
import fs from 'fs';
import { log, error, getSiYuanDir, chooseTarget, getThisPluginName, syncDirectoryAtomic } from './utils.js';

let targetDir = process.env?.SIYUAN_PLUGIN_DIR || '';

/**
 * 1. Get the parent directory to install the plugin
 */
log('>>> Resolve SiYuan plugin directory...');
if (targetDir) {
    log(`\tGot target directory from environment variable "SIYUAN_PLUGIN_DIR": ${targetDir}`);
} else {
    log('>>> Environment variable "SIYUAN_PLUGIN_DIR" is not set, try to get SiYuan directory automatically....');
    let res = await getSiYuanDir();

    if (!res || res.length === 0) {
        error('\tCan not get SiYuan directory automatically. Set "SIYUAN_PLUGIN_DIR" and retry.');
        process.exit(1);
    } else {
        targetDir = await chooseTarget(res);
        if (!targetDir) {
            error('\tMultiple workspaces detected. Set "SIYUAN_PLUGIN_DIR" and retry.');
            process.exit(1);
        }
    }

    log(`>>> Successfully got target directory: ${targetDir}`);
}
if (!fs.existsSync(targetDir)) {
    error(`Failed! Plugin directory not exists: "${targetDir}"`);
    error('Please set "SIYUAN_PLUGIN_DIR" to your SiYuan plugins directory.');
    process.exit(1);
}

/**
 * 2. The dev directory, which contains the compiled plugin code
 */
const devDir = `${process.cwd()}/dev`;
if (!fs.existsSync(devDir)) {
    error(`Failed! Dev directory not exists: "${devDir}"`);
    error('Please run "pnpm run build" or "pnpm run dev" first to generate the dev directory');
    process.exit(1);
}

/**
 * 3. The target directory to copy dev directory contents
 */
const name = getThisPluginName();
if (name === null) {
    process.exit(1);
}
const targetPath = `${targetDir}/${name}`;

/**
 * 4. Prepare target directory path
 */
log(`>>> Preparing target directory: ${targetPath}`);
if (!fs.existsSync(targetPath)) {
    log(`Target directory does not exist yet; it will be created during sync`);
} else {
    log(`Target directory already exists; it will be swapped after staging files`);
}

/**
 * 5. Stage all contents, then swap the target directory in one step.
 * Updating the live SiYuan plugin directory file-by-file can trigger repeated
 * unload/load cycles while index.js or index.css is only partially updated.
 */
syncDirectoryAtomic(devDir, targetPath);
log(`>>> Successfully synchronized all files to SiYuan plugins directory!`);
