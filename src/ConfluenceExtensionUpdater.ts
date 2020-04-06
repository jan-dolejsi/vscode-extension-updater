/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi 2020. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as https from 'https';
import { ExtensionContext, Uri } from 'vscode';
import { ExtensionUpdater, ExtensionVersion } from './ExtensionUpdater';

export interface ConfluenceOptions {
    /** Confluence host e.g. `wiki.my-company.com` */
    confluenceHost: string;

    /** Page ID that to which the .vsix files are uploaded as attachments. This a number in the page URL e.g. `pageId=123456`. */
    confluencePageId: number;
}

/**
 * Downloads extension updates from a Confluence page attachments.
 * Here is documentation about the Confluence REST API:
 * https://docs.atlassian.com/atlassian-confluence/REST/6.6.0/#content/{id}/child/attachment-getAttachments
 */
export class ConfluenceExtensionUpdater extends ExtensionUpdater {

    /** Confluence host e.g. `wiki.my-company.com` */
    private confluenceHost: string;

    /** Page ID that to which the .vsix files are uploaded as attachments. */
    private confluencePageId: number;

    /**
     * Constructs the confluence extension updater for the current extension.
     * @param context extension context
     * @param options confluence options
     */
    constructor(context: ExtensionContext, options: ConfluenceOptions) {
        super(context);
        this.confluenceHost = options.confluenceHost;
        this.confluencePageId = options.confluencePageId;
    }

    private createVersionUrl(): string {
        return `https://${this.confluenceHost}/rest/api/content/${this.confluencePageId}/child/attachment?filename=${this.getConfluenceFileName()}&expand=version`;
    }

    /**
     * By default, this class uses the extension name (without version) and the `.vsix` suffix to locate the extension binaries in the list of Confluence attachments.
     * Override this logic, if you have a different naming convention.
     */
    protected getConfluenceFileName(): string {
        return this.getExtensionManifest().name + '.vsix';
    }

    protected async getVersion(): Promise<ExtensionVersion> {

        const url = this.createVersionUrl();
        console.log(`Checking for new versions at ${url}`);

        return new Promise<ExtensionVersion>((resolve, reject) => {
            https.get(url,
                {
                    headers: {
                        "Accept": " application/json",
                    }
                },
                (resp) => {
                    let data = '';
                    // A chunk of data has been received.
                    resp.on('data', (chunk) => {
                        data += chunk;
                    });
                    // The whole response has been received. Print out the result.
                    resp.on('end', () => {
                        const attachment = JSON.parse(data);
                        if (attachment["results"] && attachment["results"].length > 0) {
                            const version = attachment["results"][0]["version"]["number"];
                            const when = Date.parse(attachment["results"][0]["version"]["number"]);
                            const downloadPath = attachment["results"][0]["_links"]["download"];
                            const self = Uri.parse(attachment["results"][0]["_links"]["self"]);
                            const downloadUrl = Uri.parse(downloadPath).with({ scheme: self.scheme, authority: self.authority });
                            resolve({ version, when, downloadUrl });
                        }
                        else {
                            console.dir(attachment);
                            reject(new Error(`Unexpected response from Confluence. Full response is in the console/log.`));
                        }
                    });
                }).on("error", (err) => {
                    console.error("Error: " + err.message);
                    reject(err);
                });
        });
    }
}