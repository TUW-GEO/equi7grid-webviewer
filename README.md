# Equi7Grid webviewer

Webviewer for Equi7Grid zone, tiling system, and tile display and interaction.

## Deployment

### Development 

For developing or testing the webviewer, we recommend that you clone the repo and 
deploy it locally on your machine. First, install `uv`:

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

To start the webviewer, you need to execute the following command:

```bash
python app.py
```

### Operations

For deploying the webviewer in an operational manner, we recommend to use the tagged docker images.
In this example we pull the tag `0.1.0` from the TUW-GEO package registry:

```bash
docker pull ghcr.io/tuw-geo/equi7grid-webviewer:0.1.0
```

To start the webviewer, you need to execute the following command:

```bash
docker run -p 5000:5000 equi7grid-webviewer:0.1.0
```

Note that the docker port 5000 is mapped to the host port 5000 and needs to be modified according to the operational setup.

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
