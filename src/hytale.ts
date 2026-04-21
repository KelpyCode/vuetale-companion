import * as os from 'os';
import * as path from 'path';

/**
 * Returns the path to the Hytale "latest" package directory
 * (where Server/HytaleServer.jar and Assets.zip live)
 */
export function getHytalePackageDir() {
    const platform = os.platform();

    if (platform === 'win32') {
        // Windows: %APPDATA%\Hytale\install\release\package\game\latest
        const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
        return path.join(appData, 'Hytale', 'install', 'release', 'package', 'game', 'latest');
    }
    else if (platform === 'linux') {
        // Linux: $XDG_DATA_HOME/Hytale/install/release/package/game/latest
        // Falls back to ~/.local/share if XDG_DATA_HOME is not set
        const xdgDataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
        return path.join(xdgDataHome, 'Hytale', 'install', 'release', 'package', 'game', 'latest');
    }
    else if (platform === 'darwin') {
        // macOS 
        return path.join(os.homedir(), 'Library', 'Application Support', 'Hytale', 'install', 'release', 'package', 'game', 'latest');
    }
    else {
        throw new Error(`Unsupported platform: ${platform}`);
    }
}

export function getHytaleServerJarPath() {
    return path.join(getHytalePackageDir(), 'Server', 'HytaleServer.jar');
}