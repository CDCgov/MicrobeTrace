# 3D Network View wiki draft

This package contains a GitHub wiki draft, eight real images captured from MicrobeTrace, and an offline preview. The screenshots use the built-in sample dataset on branch `995-3d_network` at merge commit `a615c207`.

The draft follows the use-case structure, numbered instructions, inline images, helpful controls, and troubleshooting style of the [Evolutionary Rate View wiki page](https://github.com/CDCgov/MicrobeTrace/wiki/Evolutionary-Rate-View).

## Review locally

Open `Preview.html` to review the complete page. It embeds all eight images and works as a standalone offline file. `3D-Network-View.md` contains the same text with portable local image paths. The wiki supplies the page title, so the Markdown body begins with the development notice rather than a repeated title.

Images 01 through 07 are screenshots of the application. Image 08 is a PNG created through the application's own export dialog. The source dataset is simulated. The example uses node size 10, frame width 1.5, State colors, WHOclass shapes, and shortened link-origin display names. Later images also show link transparency 0.25 and directed/bidirectional arrow controls. The layout and camera angle can differ when repeating the steps.

## Publish through the wiki repository

1. Open a local checkout of `https://github.com/CDCgov/MicrobeTrace.wiki.git`.
2. Copy `GitHub-Wiki-Version.md` into that checkout as `3D-Network-View.md`.
3. Copy the bundled `images/3d-network/` folder into the checkout's `images/3d-network/` folder.
4. Review the changes, then commit and push them through your normal wiki workflow.

`GitHub-Wiki-Version.md` uses absolute raw image URLs pointing to those wiki-repository paths. They become available when the images are published. The portable Markdown and local preview work before publication.

## Publish through the GitHub editor

Create a wiki page titled **3D Network View** and paste the body of `3D-Network-View.md`. Upload the eight PNGs using your usual GitHub image-attachment workflow, then replace each local `src` value with its uploaded image URL. GitHub supports image URLs and alt text in wiki content; see [Editing wiki content](https://docs.github.com/en/communities/documenting-your-project-with-wikis/editing-wiki-content).

Published on November 9, 2026: [3D Network View](https://github.com/CDCgov/MicrobeTrace/wiki/3D-Network-View), in wiki commit `f95f3c8f058dbbfd47b0011e1ed374e83ad46ae9`. The publication includes the guide, all eight images, and a **3D Network (development)** entry in the wiki Home page's Views table. The live page, development-only notice, Home link, and all eight images were verified in Chrome.

No Cypress tests were run for this documentation task.
