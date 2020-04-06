/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as tmp from 'tmp';

export async function file(mode: number, prefix: string, postfix: string): Promise<TempFile> {
    return new Promise<TempFile>((resolve, reject) => {
        tmp.file({ mode: mode, prefix: prefix, postfix: postfix },
            (err: unknown, path: string, fd: number) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve({ path: path, fd: fd });
                }
            });
    });
}

export interface TempFile {
    path: string; fd: number;
}

export async function dir(mode: number, prefix?: string, postfix?: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        tmp.dir({ mode: mode, prefix: prefix, postfix: postfix },
            (err: unknown, path: string) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(path);
                }
            });
    });
}
