# Build Turbo Reader's Linux packages without installing the toolchain.
#
#   docker build -f docker/linux-build.Dockerfile --output dist-linux .
#
# The .deb, .rpm and .AppImage land in ./dist-linux. Ubuntu 22.04 matches the
# release workflow, so the AppImage runs on the same range of distributions.

FROM ubuntu:22.04 AS build

ENV DEBIAN_FRONTEND=noninteractive \
    CARGO_HOME=/usr/local/cargo \
    RUSTUP_HOME=/usr/local/rustup \
    PATH=/usr/local/cargo/bin:$PATH \
    # linuxdeploy is itself an AppImage, and containers have no FUSE.
    APPIMAGE_EXTRACT_AND_RUN=1

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential curl wget file ca-certificates pkg-config \
      libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev \
      libssl-dev patchelf xdg-utils rpm \
 && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain stable \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx tauri build --bundles deb,rpm,appimage

# Only the packages leave the build.
FROM scratch AS packages
COPY --from=build /src/src-tauri/target/release/bundle/deb/*.deb /
COPY --from=build /src/src-tauri/target/release/bundle/rpm/*.rpm /
COPY --from=build /src/src-tauri/target/release/bundle/appimage/*.AppImage /
