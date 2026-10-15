# Pinned GDevelop core

These files were downloaded by the repository owner from
`https://s3.amazonaws.com/gdevelop-gdevelop.js/master/latest/libGD.js`
and `https://s3.amazonaws.com/gdevelop-gdevelop.js/master/latest/libGD.wasm`,
and supplied on 2026-10-15. The upstream build commit is unknown; these are
not claimed to be an exact build of this fork's C++ sources.

The core is covered by the repository's MIT license. `checksums.json` records
SHA-256 digests of the supplied bytes. `scripts/import-libGD.js` verifies these
files and copies them to the generated public and test directories without
contacting S3. An explicitly compiled core in `Binaries/embuild/GDevelop.js`
still takes precedence.

To upgrade, replace BOTH files from the same build, update the checksums,
and test editor startup, project creation, saving, and game preview together.
Do not update only one file. Building the editor alone does not prove core/API
compatibility.
