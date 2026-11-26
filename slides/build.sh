#!/usr/bin/env bash
# Compiles slides/turnout-slides.tex to Turnout-slides.pdf at the repo root (XeLaTeX in the TeX Live Docker image, no network).
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
docker run --rm --network none -u "$(id -u):$(id -g)" -v "$root":/work -w /work/slides \
  texlive/texlive:latest-full latexmk -xelatex -interaction=nonstopmode -halt-on-error turnout-slides.tex
cp "$root/slides/turnout-slides.pdf" "$root/Turnout-slides.pdf"
echo "wrote Turnout-slides.pdf"
