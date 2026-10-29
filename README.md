# Solid Data Manager

![Solid Data Manager](1.png)

Testinstanz: https://solid-data-manager.tmdt.info

Solid Data Manager is a standalone React application for managing files in a Solid Pod. It provides a simple UI for browsing, uploading, downloading, and organizing resources in a Pod, and can also be embedded as a library in other applications.

## Features

- File and folder browsing for Solid Pods
- Upload, download, and delete resources
- Embedded mode via a lightweight bundle
- Solid authentication integration (Inrupt client libraries)
- SPA routing with static hosting support (Nginx)

## Downloads

Select a folder and choose **Download** in the selection toolbar or context menu
to save a ZIP containing its files, subfolders and empty folders. A mixed
selection of folders and files produces one ZIP; selecting only files keeps the
individual file downloads. All reads use the current Solid session.

A progress display offers cancellation. Unreadable or missing resources stop the
archive download instead of silently producing an incomplete ZIP. Archives are
limited to 256 MiB of input/output, 10,000 entries and 64 nested folder levels to
bound browser memory and traversal. No Pod data or permissions are changed.

## Installation (Docker)

### Production

Build and run the production container:

```bash
docker compose up --build
```

The app is served on port `3002` by default and is reachable at `http://localhost:3002`.

### Development

Run the dev container with live code mounting:

```bash
docker compose -f docker-compose.dev.yaml up --build
```

### Configuration

- `FRONTEND_PORT` (default: `3002`) controls the host port mapped to the container.
- For production image builds you can also set `PUBLIC_URL` (default: `/solid-data-manager`).

## Embedding

The embed entrypoint is exported as `@hoelk-f/solid-data-manager/embed` and exposes:

- `DataManagerEmbed` - router-free component (requires `webId` prop)
- `setSession` - optional override to inject a host session instance
- `@hoelk-f/solid-data-manager/embed.css` - styles for the embedded Data Manager

Example:

```js
import { DataManagerEmbed, setSession } from "@hoelk-f/solid-data-manager/embed";
import "@hoelk-f/solid-data-manager/embed.css";
import session from "./solidSession";

setSession(session);

<DataManagerEmbed webId={webId} />;
```

## Acknowledgements

This work has been supported as part of the research project _Gesundes Tal_ in collaboration with the city of Wuppertal, funded by the Federal Ministry of Housing, Urban Development and Building (BMWSB) and the Reconstruction Loan Corporation (KfW) through the funding program “Modellprojekte Smart Cities: Stadtentwicklung und Digitalisierung” (grant number 19454890).

## License

This project is licensed under the Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).


## Citation

If you use this repository, please cite it using the metadata in [CITATION.cff](CITATION.cff).
