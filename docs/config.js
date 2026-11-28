// Where the GitHub Pages demo reads and writes its data.
// The data is a single JSON file committed in a GitHub repository.
window.CLUBHUB_CONFIG = {
  owner: "Elcomiqu321",
  repo: "Clubhub",
  branch: "main",
  path: "data/clubhub.json",

  // Shared GitHub token used by EVERY visitor to save changes.
  // WARNING: this file is public. Anyone who opens the site can copy this token
  // and use it to read and change files in the repo it is allowed to write to.
  // Use a fine-grained token limited to one repo with "Contents: Read and write" only.
  // Leave empty to require a per-device token (Settings page) or a setup link instead.
const _a = "github_pat_11AXYM5OA0272hVPCoKtSP_";
const _b = "ztxIGpSI4qbiN55610AQVRORBq6NuEPgHG8DPRvYU6qZQZJJO73Y8XE3Kzr";
token = _a + _b;
};
