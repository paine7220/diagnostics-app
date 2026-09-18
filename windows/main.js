const {app, BrowserWindow, shell, session} = require('electron');
const fs = require('fs');
const path = require('path');
const {version} = require('./package.json');

app.setName('Auto/Truck Diagnostics for Dummies');
app.setAppUserModelId('com.michaelpaine.autotruckdiagnosticsfordummies');

const APP_ROOT = path.join(__dirname, 'app');
const ICON = path.join(__dirname, 'build', 'icon.png');

function iconPath(){
  return fs.existsSync(ICON) ? ICON : undefined;
}

function fileFromUrl(url){
  const parsed = new URL(url);
  return decodeURIComponent(parsed.pathname).replace(/^\/([A-Za-z]:)/, '$1');
}

function isLocalAppUrl(url){
  try{
    const parsed = new URL(url);
    if(parsed.protocol !== 'file:') return false;
    const resolved = path.normalize(fileFromUrl(url));
    return resolved.toLowerCase().startsWith(path.normalize(APP_ROOT).toLowerCase());
  }catch(_err){
    return false;
  }
}

function windowOptions(){
  return {
    width: 1280,
    height: 850,
    minWidth: 900,
    minHeight: 650,
    backgroundColor: '#090909',
    title: 'Auto/Truck Diagnostics for Dummies',
    icon: iconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      additionalArguments: ['--atd-version=' + version],
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  };
}

function attachWindowHandlers(win){
  win.webContents.setWindowOpenHandler(({url}) => {
    if(isLocalAppUrl(url)){
      const child = new BrowserWindow(windowOptions());
      attachWindowHandlers(child);
      child.removeMenu();
      child.loadURL(url);
      return {action: 'deny'};
    }
    if(/^https?:/i.test(url)) shell.openExternal(url);
    return {action: 'deny'};
  });
  win.webContents.on('will-navigate', (event, url) => {
    if(isLocalAppUrl(url)) return;
    event.preventDefault();
    if(/^https?:/i.test(url)) shell.openExternal(url);
  });
}

function createWindow(){
  const win = new BrowserWindow(windowOptions());
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(['media'].includes(permission)));
  attachWindowHandlers(win);
  win.loadFile(path.join(APP_ROOT, 'index.html'));
  win.removeMenu();
  return win;
}

const gotLock = app.requestSingleInstanceLock();
if(!gotLock){
  app.quit();
}else{
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if(win){
      if(win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
      if(BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if(process.platform !== 'darwin') app.quit();
});
