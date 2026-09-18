const {contextBridge} = require('electron');

const versionArg = process.argv.find((arg) => arg.startsWith('--atd-version='));
const version = versionArg ? versionArg.slice('--atd-version='.length) : '1.2.0';

contextBridge.exposeInMainWorld('ATD_DESKTOP', {
  version,
  platform: process.platform
});
