# Equi7Grid webviewer

Webviewer for Equi7Grid zone, tiling system, and tile display and interaction.

## Installation

This package can be installed via pip:

```bash
pip install equi7grid-webviewer
```

## Deployment

### Setup

First, install `uv`:

```bash
wget -qO- https://astral.sh/uv/install.sh | sh
```

Next, create your virtual environment, e.g.

```bash
uv venv --python 3.12
```

Finally, you can add all required and optional dependencies to it:

```bash
uv pip install -r pyproject.toml
```

### Operation

```bash
python app.py
```

## Contribute

We are happy if you want to contribute. Please raise an issue explaining what
is missing or if you find a bug. We will also gladly accept pull requests
against our master branch for new features or bug fixes.

### Guidelines

If you want to contribute please follow these steps:

- fork the `equi7grid-webviewer` repository to your account
- clone the repository
- make a new feature branch from the `equi7grid-webviewer` main branch
- add your feature
- submit a pull request to our main branch
