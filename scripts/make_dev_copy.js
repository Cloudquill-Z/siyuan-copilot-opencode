/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-07-13
 * @FilePath     : /scripts/make_dev_copy.js
 * @LastEditTime : 2025-07-13
 * @Description  : Copy plugin files to SiYuan plugins directory instead of creating symbolic links
 */
import fs from 'fs';
import path from 'path';
import { log, error, getSiYuanDir, chooseTarget, getThisPluginName, copyDirectory } from './utils.js';

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
 * 4. Create target directory if it doesn't exist
 */
log(`>>> Ensuring target directory exists: ${targetPath}`);
if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(targetPath, { recursive: true });
    log(`Created directory: ${targetPath}`);
} else {
    log(`Target directory already exists, will update files incrementally`);
}

/**
 * 5. Copy/update all contents from dev directory to target directory
 * This will only update changed files instead of deleting everything
 */
copyDirectory(devDir, targetPath);
log(`>>> Successfully synchronized all files to SiYuan plugins directory!`);
