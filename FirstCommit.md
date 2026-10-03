# First commit handoff

This is the recovered 0.1.0 baseline, renamed BasketCompass. It does not contain the later unrecovered prototype. No Git history, credentials or hosting metadata is included.

1. Copy these files into your local checkout of https://github.com/rajeevyadav/BasketCompass.
2. Configure your own Git author and committer email. Set OWNER_EMAIL to that same email in your shell and in GitHub Settings → Secrets and variables → Actions → Variables. No owner email is hardcoded.
3. Run `git config core.hooksPath .githooks` and `npm test`. On Windows ensure the Python hook interpreter is available. Hooks are local and can be bypassed; remote CI is the second gate.
4. Review the diff and create the first commit yourself. Then push it yourself.
5. In repository Settings → Pages select GitHub Actions. The workflow deploys dist under /BasketCompass/ after verification.
6. After the first CI run, configure a main ruleset: require pull requests and the verify status check; block force pushes and deletion; restrict bypass and direct pushes to the owner. For a solo maintainer, requiring another reviewer can prevent all merges; select a workable approval count. Configure the github-pages environment to allow main only.

Checks block metadata; they cannot prove who operated the keyboard. Nothing automatically rewrites history, edits source or creates cleanup commits. No repository protection has been applied remotely by this package.

## Open release gates

Automatic nearby-store discovery, all-store/non-grocery feeds, global tax packs, source-marker scanning, complete development-lifecycle documentation/traceability, comprehensive security/usability verification, and real-device installation tests remain pending. Do not represent this baseline as the completed requested engineering package.
