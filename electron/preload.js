// Preload minimal — isolation de contexte activée, aucune API Node exposée.
"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cheetahDesktop", {
  version: process.env.npm_package_version || "desktop",
  platform: process.platform,
});

// API de sauvegarde exposée à l'app web (dossier externe natif, ouvrir le dossier).
contextBridge.exposeInMainWorld("cheetahBackup", {
  chooseFolder: () => ipcRenderer.invoke("backup:choose-folder"),
  revealBackups: () => ipcRenderer.invoke("backup:reveal"),
});
