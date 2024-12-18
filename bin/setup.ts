#! node.exe

import decompress from "decompress";
import { createWriteStream, existsSync, mkdirSync, rmSync } from "fs";
import { get } from "https";
import { join } from "path";
import { format } from "util";

async function _getLatestRelease(
	owner: string,
	repo: string,
): Promise<string> {
	const options = {
		hostname: "api.github.com",
		path: `/repos/${owner}/${repo}/releases/latest`,
		method: "GET",
		headers: {
			"User-Agent": "node.js",
			Accept: "application/vnd.github.v3+json",
		},
	};

	return new Promise((resolve, reject) => {
		get(options, (res) => {
			let data: string = "";

			res.on("data", (chunk) => {
				data += chunk;
			});

			res.on("end", () => {
				if (res.statusCode === 200) {
					const latestRelease = JSON.parse(data);

					resolve(latestRelease.tag_name);
				} else {
					reject(
						`Failed to fetch the latest release. Status code: ${res.statusCode}`,
					);
				}
			});
		}).on("error", (err) => {
			reject(`Error: ${err.message}`);
		});
	});
}

function _downloadFile(sourceUrl: string, to: string, cb: Function): void {
	get(sourceUrl, (response) => {
		if (response.statusCode === 200) {
			const fileStream = createWriteStream(to);
			response.pipe(fileStream);
			fileStream.on("close", () => {
				cb();
			});
		} else if (
			[301, 302].some((statusCode) => response.statusCode === statusCode)
		) {
			const redirectedUrl: string = response.headers.location as string;
			_downloadFile(redirectedUrl, to, cb);
			return;
		} else {
			throw new Error(
				`Failed to download ncnn: ${response.statusCode} ${response.statusMessage}`,
			);
		}
	}).on("error", (err: Error) => {
		console.error(`Error downloading file: ${err.message}`);
	});
}

function _extractFile(archive: string, destPath: string): void {
	console.log("extracting: " + archive);

	decompress(archive, destPath, {
		strip: 1,
	}).then(() => {
		rmSync(archive, { recursive: true });
	});
}

function install(url: string, destPath: string): void {
	const tempFilePath: string = join(__dirname, "temp.zip");

	//mkdir
	mkdirSync(destPath, { recursive: true });

	console.log("fetching: " + url);

	_downloadFile(url, tempFilePath, () => {
		_extractFile(tempFilePath, destPath);
		console.log("ncnn-CLI installation complete.");
	});

	_downloadModels(destPath);
}

function _downloadModels(destPath: string): void {
	const sourceUrl: string =
		"https://github.com/iamspdarsan/pixteroid/releases/download/0.0.0/model.weights.zip";

	const tempFilePath: string = join(__dirname, "models.zip");

	const modelPath: string = join(destPath, "models");

	_downloadFile(sourceUrl, tempFilePath, () => {
		_extractFile(tempFilePath, modelPath);
		console.log("Model weights downloaded.");
	});
}

async function main(): Promise<void> {
	const destpath: string = join(__dirname, "..", "..", "bin/ncnn");

	if (existsSync(destpath)) {
		return;
	}

	const downloadPath: string =
		"https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan/releases/download/%s/realesrgan-ncnn-vulkan-%s-%s";

	const version: Awaited<string> = await _getLatestRelease(
		"xinntao",
		"Real-ESRGAN-ncnn-vulkan",
	);

	if (process.platform === "darwin") {
		install(format(downloadPath, version, version, "macos.zip"), destpath);
	} else if (process.platform === "win32") {
		install(
			format(downloadPath, version, version, "windows.zip"),
			destpath,
		);
	} else if (process.platform === "linux") {
		install(
			format(downloadPath, version, version, "ubuntu.zip"),
			destpath,
		);
	}
}

main().catch((err: Error) => {
	console.log(err);
	process.exit(1);
});
