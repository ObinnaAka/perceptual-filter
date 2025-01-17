# Extension

ignore the rest of this
just run pnpm build
load unpacked extension in chrome
keep doing that to test sicne the dev env doesn't work with linkedin

This is a [Plasmo extension](https://docs.plasmo.com/) project bootstrapped with [`plasmo init`](https://www.npmjs.com/package/plasmo).

## Getting Started

First, run the development server:

```bash
pnpm dev
# or
npm run dev
```

Open your browser and load the appropriate development build. For example, if you are developing for the chrome browser, using manifest v3, use: `build/chrome-mv3-dev`.

You can start editing the popup by modifying `popup.tsx`. It should auto-update as you make changes. To add an options page, simply add a `options.tsx` file to the root of the project, with a react component default exported. Likewise to add a content page, add a `content.ts` file to the root of the project, importing some module and do some logic, then reload the extension on your browser.

For further guidance, [visit our Documentation](https://docs.plasmo.com/)

## Making production build

Run the following:

```bash
pnpm build
# or
npm run build
```

This should create a production bundle for your extension, ready to be zipped and published to the stores.

## Submit to the webstores

The easiest way to deploy your Plasmo extension is to use the built-in [bpp](https://bpp.browser.market) GitHub action. Prior to using this action however, make sure to build your extension and upload the first version to the store to establish the basic credentials. Then, simply follow [this setup instruction](https://docs.plasmo.com/framework/workflows/submit) and you should be on your way for automated submission!

## Debugging

To debug the extension:

1. Install the [Cookie Editor](https://chromewebstore.google.com/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm) extension in both:

   - Your normal Chrome browser
   - The debugger Chrome instance that opens when running the VSCode debugger

2. In your normal Chrome browser:

   - Go to linkedin.com and ensure you're logged in
   - Open Cookie Editor and export the cookies

3. In the debugger Chrome instance:

   - Launch it using the VSCode debugger with the provided launch.json file
   - Go to linkedin.com
   - Open Cookie Editor and import the cookies from step 2
   - Note: Google sign-in doesn't work in the debugger Chrome instance

4. The extension should now work with your LinkedIn account in the debugger! Now you can just run the debugger and you'll be logged in and redirected to the feed page.

You can also reverse this process to copy cookies from the debugger Chrome to your normal browser if needed.
