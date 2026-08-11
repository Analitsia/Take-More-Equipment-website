/**
 * Install the git hooks. On a developer's machine only.
 *
 * `prepare` runs on every `npm install`, which includes the one Vercel runs
 * before a build — and the first deployment after husky was added died there:
 *
 *     > prepare
 *     > husky
 *     sh: line 1: husky: command not found
 *     Error: Command "npm install" exited with 127
 *
 * A build machine has nothing to hook. There is no working tree anybody will
 * commit from, husky is a devDependency that a production install need not have
 * on PATH at all, and the checks the hooks run locally are the same ones CI runs
 * properly a minute later. So skip, early, before the import — importing a
 * package that may not be installed is the failure being fixed.
 *
 * Everywhere else this fails LOUDLY. `husky || true` is the obvious one-liner
 * and it is the wrong answer: a developer whose hooks silently failed to
 * install is exactly the person the hooks exist to catch, and they would find
 * out by pushing something red to main, which deploys.
 */

if (process.env.CI || process.env.VERCEL) {
  console.log("  git hooks skipped — a build machine has no commits to check");
  process.exit(0);
}

// Called as a function rather than as a binary: no PATH lookup, and no
// cmd.exe-versus-sh difference on the Windows machine this is developed on.
const { default: husky } = await import("husky");

// Husky reports refusals by returning a reason, not by throwing — an empty
// string is success. `.git can't be found` is one of them, which is what a
// tarball install or a stray subdirectory looks like.
const reason = husky();
if (reason) {
  console.error(`  git hooks NOT installed: ${reason}`);
  process.exit(1);
}
