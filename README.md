# Visual Studio Code custom extension updater for private extension marketplaces

[![CI](https://github.com/jan-dolejsi/vscode-extension-updater/actions/workflows/npm-publish.yml/badge.svg)](https://github.com/jan-dolejsi/vscode-extension-updater/actions/workflows/npm-publish.yml)
[![npm](https://img.shields.io/npm/v/vscode-extension-updater)](https://www.npmjs.com/package/vscode-extension-updater)
[![Gitpod Ready-to-Code](https://img.shields.io/badge/Gitpod-Ready--to--Code-blue?logo=gitpod)](https://gitpod.io/#https://github.com/jan-dolejsi/vscode-extension-updater)

For context and motivation, please look at the [Private extension market](https://github.com/microsoft/vscode/issues/21839)
a.k.a _side loading_.

This package does not provide the extension marketplace (with the ability to pick an extension and install it),
but assuming you point your VS Code user population to download and install the extension manually,
as long as your extension starts this updater at its activation, this takes care of the usual workflow:

1. Checks whether new version is available
2. Asks user, whether they want to download and install now
3. Downloads the new version `.vsix` to a local temp file
4. Installs the new version
5. Offers to re-load the window to load the new version

This package purpose is to:

* Provide a base class for extension update abstracting from the type of the private repository
* Provider specific implementations (please contribute, if you see fit). So far there is support for
  * Confluence wiki

Here is a demo:

![Extension auto-update from Confluence wiki attachment](confluence_wiki_extension_updater.gif)

## Get Started

Fetch the package using

```bash
npm install vscode-extension-updater
```

### Using the Confluence wiki based private extension repository

Assuming you have a Confluence wiki. Package your extension using package that looks like this:

```bash
vsce package \
    --out=<package.name>.vsix \
    --baseContentUrl=https://your-confluence-wiki.com/download/attachments/123456/ \
    --baseImagesUrl=https://your-confluence-wiki.com/download/attachments/123456/
```

Where `<package.name>` is the name of your extension as defined in your `package.json`.
The `123456` stands for the page ID, where this extension's .vsix is uploaded as attachment.

This means you can setup one page per extension and thus create a catalog (just hort of marketplace)
of your private extensions.

Put this to your `extension.ts` (or `.js` if you insist) `activate` function:

```typescript
import { ConfluenceExtensionUpdater } from 'vscode-extension-updater';

export function activate(context: ExtensionContext): void {

    // ... your extension activation code...

    setTimeout(() => {
        checkNewVersion(context, false);
    }, 30000); // give it 30sec before checking
}

async function checkNewVersion(context: ExtensionContext, showUpToDateConfirmation: boolean): Promise<void> {
    try {
        await new ConfluenceExtensionUpdater(context, {
            confluenceHost: 'your-confluence-wiki.com',
            confluencePageId: 123456
            showUpToDateConfirmation: showUpToDateConfirmation
        }).getNewVersionAndInstall();
    }
    catch (err) {
        showErrorMessage('Failed to check for new version of the the extension: ', err);
    }
}
```

### Adding manual check for new version

VS Code supports extension-specific commands. They show in the menu that displays when you click on the cogwheel button of your extension in the Extensions view. Add this to your `package.json`:

```json
{
    "contributes": {
        "commands": [
            {
                "command": "yourExt.checkForExtensionUpdate",
                "title": "yourExt: Check for new extension version..."
            },
        ],
        "menus": {
            "extension/context": [
                {
                    "command": "yourExt.checkForExtensionUpdate",
                    "when": "extension == publisherId.extensionId && extensionStatus == installed"
                }
            ]
...
}
```

... where `publisherId`, `extensionId` and `yourExt` must be replaced with the corresponding values from your `package.json`.

Add this to your `extension.ts` `activate()` method:

```typescript
    context.subscriptions.push(commands.registerCommand("yourExt.checkForExtensionUpdate", () =>
        checkNewVersion(context, true).catch(showError)));
```

In this case, we pass `true` to the `showUpToDateConfirmation` argument, which will show notification even if there is no new version.

## Implementing your own adapter to other custom back-end

Look at the `ConfluenceExtensionUpdater` class as an example of implementation.
Essentially, the only thing you may need to do is to implement this abstract method:

```typescript

import { ExtensionUpdater, ExtensionVersion } from './ExtensionUpdater';

export class YourExtensionUpdater extends ExtensionUpdater {

    constructor(context: ExtensionContext, options: YourMarketplaceOptions) {
        super(context);
        this.url = options.url;
        // ...
    }

    protected async getVersion(): Promise<ExtensionVersion> {
        // download
    }
}
```

And the base class would do the same if you integrate it into your extension's `activate` function.
