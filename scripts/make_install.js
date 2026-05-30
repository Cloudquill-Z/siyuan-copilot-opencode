/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-28 20:03:59
 * @FilePath     : /scripts/make_install.js
 * @LastEditTime : 2024-09-06 18:08:19
 * @Description  : 
 */
// make_install.js
import fs from 'fs';
import { log, error, getSiYuanDir, chooseTarget, syncDirectoryAtomic, getThisPluginName } from './utils.js';

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
        log('>>> SiYuan not detected. Auto-install skipped.');
        process.exit(0);
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
 * 2. The dist directory, which contains the compiled plugin code
 */
const distDir = `${process.cwd()}/dist`;
if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir);
}

/**
 * 3. The target directory to install the plugin
 */
const name = getThisPluginName();
if (name === null) {
    process.exit(1);
}
const targetPath = `${targetDir}/${name}`;

/**
 * 4. Stage the compiled plugin code, then swap the target directory in one step
 */
syncDirectoryAtomic(distDir, targetPath);
