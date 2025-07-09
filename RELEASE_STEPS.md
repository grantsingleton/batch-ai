# Step-by-Step Release Guide for v1.0.0

Follow these steps to merge PR #12 and release v1.0.0:

## 1. Merge the PR on GitHub

1. Go to [PR #12](https://github.com/grantsingleton/batch-ai/pull/12)
2. Click "Merge pull request" (or "Squash and merge" if you prefer)
3. Use this merge commit message:

   ```
   feat: add image support and unify input format (#12)

   BREAKING CHANGE: Input format changed from string to ContentPart[] for all providers
   ```

## 2. Update Your Local Repository

```bash
# Switch to main branch
git checkout main

# Pull the latest changes
git pull origin main
```

## 3. Create the Version Tag

```bash
# Bump to version 1.0.0
npm version major -m "chore: release v1.0.0

BREAKING CHANGE: Input format changed from string to ContentPart[] for all providers

- Add image support for batch requests
- Unify input format across OpenAI and Anthropic providers
- See CHANGELOG.md for migration guide"
```

## 4. Update CHANGELOG

```bash
# Edit CHANGELOG.md and change [Unreleased] to [1.0.0] - 2025-01-XX
# (Replace XX with today's date)
```

## 5. Push Changes and Tag

```bash
# Push the version commit and tag
git push origin main
git push origin --tags
```

## 6. Publish to npm

```bash
# Publish the new version
npm publish
```

## 7. Create GitHub Release

1. Go to https://github.com/grantsingleton/batch-ai/releases/new
2. Select the `v1.0.0` tag
3. Title: `v1.0.0 - Image Support & Unified API`
4. Copy the contents from `RELEASE_NOTES_v1.0.0.md` into the description
5. Check "Set as the latest release"
6. Click "Publish release"

## 8. Clean Up

```bash
# Delete the temporary files
rm RELEASE_STEPS.md
rm RELEASE_NOTES_v1.0.0.md
git add -A
git commit -m "chore: clean up release files"
git push
```

## 9. Announce the Release (Optional)

Consider announcing the release on:

- Twitter/X
- Reddit (r/javascript, r/typescript)
- Dev.to or Medium
- Discord/Slack communities

## ⚠️ Important Notes

- This is a **breaking change** release
- Users will need to update their code
- The migration guide is in CHANGELOG.md
- Consider pinning an issue about the breaking changes for visibility

## 🎉 Congratulations!

You've successfully released v1.0.0 of batch-ai!
