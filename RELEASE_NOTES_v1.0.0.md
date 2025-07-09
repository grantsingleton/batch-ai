# Release Notes for v1.0.0

## 🚀 Major Release: Image Support & Unified API

We're excited to announce batch-ai v1.0.0! This major release introduces image support for batch processing and unifies the API across all providers.

## ✨ What's New

### 🖼️ Image Support

- Process images alongside text in your batch requests
- Support for image URLs in both OpenAI and Anthropic providers
- Perfect for multimodal AI applications

### 🔧 Unified API

- Both OpenAI and Anthropic now use the same input format
- Consistent developer experience across providers
- Easier to switch between providers

## ⚠️ Breaking Changes

The input format has changed from strings to ContentPart arrays:

```typescript
// Before (0.x)
const request = {
  customId: "1",
  input: "Hello world",
};

// After (1.0)
const request = {
  customId: "1",
  input: [{ type: "text", text: "Hello world" }],
};
```

## 📚 Migration Guide

### Quick Start

1. Update your package:

   ```bash
   npm install batch-ai@1.0.0
   ```

2. Update your code:
   ```typescript
   // Wrap string inputs in ContentPart format
   const requests = prompts.map((prompt, index) => ({
     customId: `request-${index}`,
     input: [{ type: "text", text: prompt }], // <-- Change here
   }));
   ```

### New Features Example

```typescript
// Text + Image processing
const requests = [
  {
    customId: "analyze-1",
    input: [
      { type: "text", text: "What's in this image?" },
      {
        type: "image_url",
        image_url: {
          url: "https://example.com/image.jpg",
        },
      },
    ],
  },
];
```

## 🙏 Credits

Special thanks to @klichen for implementing image support in [PR #12](https://github.com/grantsingleton/batch-ai/pull/12)!

## 📖 Full Changelog

See [CHANGELOG.md](https://github.com/grantsingleton/batch-ai/blob/main/CHANGELOG.md) for detailed changes and migration instructions.

## 💬 Need Help?

- Check our [migration guide](https://github.com/grantsingleton/batch-ai/blob/main/CHANGELOG.md#migration-guide)
- Open an [issue](https://github.com/grantsingleton/batch-ai/issues) if you encounter problems
- Join our discussions for questions

---

**Note**: This is a breaking change release. Please review the migration guide before upgrading.
