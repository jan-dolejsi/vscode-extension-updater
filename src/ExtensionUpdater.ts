/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi 2020. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */


import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { ExtensionContext, Uri, commands, env, window, ProgressLocation } from 'vscode';
import * as asyncTmp from './asynctmp';
import { sleep } from './utils';

/**
 * Info about the new package version.
 */
export interface ExtensionVersion {
    version: number;
    when: number;
    downloadUrl: Uri;
    /** labels/tags in the repository */
    tags?: string[];
}

/**
 * Extension `package.json` fields
 */
export interface ExtensionManifest {
    displayName: string;
    name: string;
    publisher: string;
}

export interface ExtensionUpdaterOptions {
    /** If `true`, a notification will be displayed when no new version is available. */
    showUpToDateConfirmation: boolean;
}

/**
 * Checks for new version, downloads and installs.
 */
export abstract class ExtensionUpdater {

    /** Key for storing the last installed version in the `globalState` */
    private installedExtensionVersionKey: string;

    
    /** Extension publisher + name. 
     * This is used as a key to store the last installed version 
     * as well as for the name of the temporary downloaded .vsix file. */
    private extensionFullName: string;

    /** Extension's `package.json` */
    extensionManifest: ExtensionManifest;

    constructor(private context: ExtensionContext, private options?: ExtensionUpdaterOptions) {
        this.extensionManifest = require(this.context.asAbsolutePath('package.json')) as ExtensionManifest;
        this.extensionFullName = this.extensionManifest.publisher + '.' +  this.extensionManifest.name;
        this.installedExtensionVersionKey = this.extensionFullName + '.lastInstalledConfluenceAttachmentVersion';
    }

    protected getExtensionManifest(): ExtensionManifest {
        return this.extensionManifest;
    }

    /**
     * Checks if new version is available, downloads and installs and reloads the window.
     * @returns `true` if no new version is available
     */
    async getNewVersionAndInstall(): Promise<void> {

        // 1. check if new version is available
        const newVersion = await this.showProgress(`Checking for updates for ${this.extensionManifest.displayName}`, () =>
            this.getNewVersion());

        if (newVersion) {

            if (await this.consentToInstall(newVersion)) {
                // 2. download
                const vsixPath = await this.showProgress(`Downloading ${this.extensionManifest.displayName}`, () =>
                    this.download(newVersion.downloadUrl));

                // 3. install
                await this.showProgress(`Installing ${this.extensionManifest.displayName}`, () =>
                    this.install(vsixPath));

                // store the version number installed
                this.context.globalState.update(this.installedExtensionVersionKey, newVersion.version);

                // 4. reload
                if (await this.consentToReload()) {
                    await commands.executeCommand('workbench.action.reloadWindow');
                }
            }
        }
        else {
            const message = `No update found for '${this.extensionManifest.displayName}'`;
            console.log(message);
            if (this.options?.showUpToDateConfirmation) {
                window.showInformationMessage(message);
            }
        }
    }

    /**
     * Installs VSIX package.
     * @param vsixPath path to the downloaded vsix package
     */
    private async install(vsixPath: string): Promise<void> {
        // this command does not take arguments : (
        // await commands.executeCommand('workbench.extensions.action.installVSIX', vsixPath);

        const codePath = path.join(env.appRoot, '..', '..', 'bin');

        await sleep(1000); // without this, the downloaded file appears to be corrupted

        new Promise<void>((resolve, reject) => {

            execFile('code', ["--install-extension", vsixPath, "--force"], {
                shell: true,
                cwd: codePath
            }, (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                    return;
                }

                if (stderr.includes(`Failed Installing Extensions:`)) {
                    reject(stderr);
                    return;
                }
                console.error(stderr);
                console.log(stdout);
                resolve();
            });
        });
    }

    /**
     * Downloads the .vsix from the url
     * @param downloadUri url for the .vsix package download
     */
    private async download(downloadUri: Uri): Promise<string> {
        const downloadedPath = await asyncTmp.file(0o644, this.extensionFullName, '.vsix');
        const localFile = fs.createWriteStream(downloadedPath.path);

        return new Promise<string>((resolve, reject) => {
            https.get(downloadUri.toString(),
                {
                },
                (resp) => {
                    if ((resp.statusCode ?? Number.MAX_VALUE) >= 300) {
                        console.error(`statusCode: ${resp.statusCode}`);
                        reject(new Error(`Download failed with status code: ${resp.statusCode}`));
                    }
                    
                    // direct the downloaded bytes to the file
                    resp.pipe(localFile);
                    
                    // The whole response has been received. Print out the result.
                    resp.on('close', () => {
                        console.log(`Done downloading extension package to ${downloadedPath.path}`);
                        localFile.close();
                        resolve(downloadedPath.path);
                    });
                }).on("error", (err) => {
                    console.error("Error: " + err.message);
                    reject(err);
                });
        });
    }

    /**
     * Determines whether a new version is available.
     * @returns new version, or `undefined`, if no new version is available
     */
    private async getNewVersion(): Promise<ExtensionVersion | undefined> {
        const latestVersion = await this.getVersion();

        const installedVersion = this.getCurrentVersion();

        if (installedVersion < latestVersion.version) {
            return latestVersion;
        }
        else {
            return undefined;
        }
    }

    protected abstract getVersion(): Promise<ExtensionVersion>;

    private showProgress<T>(message: string, payload: () => Thenable<T>): Thenable<T> {
        return window.withProgress({ location: ProgressLocation.Window, title: message }, payload);
    }

    private getCurrentVersion(): number {
        return this.context.globalState.get<number>(this.installedExtensionVersionKey) ?? -1;
    }

    /**
     * Requests user confirmation to download and install new version.
     * @param newVersion new version
     */
    private async consentToInstall(newVersion: ExtensionVersion): Promise<boolean> {
        const downloadAndInstall = 'Download and Install';

        const currentVersion = this.getCurrentVersion();
        const versionDiff = newVersion.version - currentVersion;
        const versionsBehindWarning = currentVersion > -1 && versionDiff > 1 ?
            `is ${versionDiff} release behind and ` : '';
        const answer = await window.showWarningMessage(`New version of the '${this.extensionManifest.displayName}' extension is available. The one you are currently using ${versionsBehindWarning}may no longer work correctly with the other tools.`,
            {}, downloadAndInstall);

        return answer === downloadAndInstall;
    }

    /**
     * Requests user confirmation to reload the installed extension
     */
    private async consentToReload(): Promise<boolean> {
        const reload = 'Reload';

        const answer = await window.showWarningMessage(`New version of the '${this.extensionManifest.displayName}' was installed.`,
            {}, reload, 'Later');

        return answer === reload;
    }
}
