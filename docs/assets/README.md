# Repository branding

`clemii-wordmark.svg` and `clemii-wordmark-dark.svg` set the clemii mark beside
the lowercase name, as the website's header does. The picture element selects
the wordmark for GitHub's light or dark theme. Both are generated with the mark
by `bun scripts/gen-clemii-mark.ts` in `webapp/apps/web`; do not edit them by hand.

The dashboard and Live Write images remain real native UI with disclosed demo
data; their capture sources are in [the native artwork notes](../../macos/docs/assets/README.md).

A GitHub repository does not have its own account avatar. The README artwork
and the repository's social preview are separate from the owner's profile
picture. Do not change the owner's account avatar to brand a single repository.
GitHub's social preview is configured in repository Settings, independently of
website Open Graph tags. See [GitHub's guide](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview).

`github-social.html` composes the wordmark and the README cover.
It retains the disclosure that the dashboard contains demo data. Regenerate the
README cover (1280 x 900) and this 1280 x 640 PNG with `node docs/assets/render-branding.mjs` from the repository
root after installing the website dependencies and Playwright Chromium. The
renderer uses only local assets. Inspect and commit the output, then upload it
under Settings > Social preview. Git commits alone cannot change that setting.
