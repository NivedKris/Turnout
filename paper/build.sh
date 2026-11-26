#!/usr/bin/env bash
# Compiles paper/turnout.tex to README.pdf at the repo root, using the TeX Live Docker image (no network).
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
docker run --rm --network none -u "$(id -u):$(id -g)" -v "$root":/work -w /work/paper \
  texlive/texlive:latest-full latexmk -pdf -interaction=nonstopmode -halt-on-error turnout.tex
cp "$root/paper/turnout.pdf" "$root/README.pdf"
echo "wrote README.pdf"
