import { exec } from "child_process";
import { cpus } from "os";
import { join, relative, resolve } from "path";

type LevelOptions =
	| "level1" //normal structutral details
	| "level2" //best structutral details
	| "level3"; //more and best structutral details

function _nonZeroAssignment(percentage: number): number {
	const int: number = Math.floor((percentage * threads) / 100);
	return int === 0 ? 1 : int;
}

/*
 *@param - executable : String => path of executable/binary.
 *@param - commandArgs : Object => command line arguments(switch and value).
 *@returns - commandLine : String => executable commandline for cli.
 */
function _commandConstrutor(
	executable: string,
	commandArgs: Record<string, string | number>,
): string {
	let commandline: string = `${executable}`;

	Object.keys(commandArgs).forEach((option: string) => {
		commandline += ` ${option} ${commandArgs[option]}`;
	});

	return commandline.replaceAll("\\", "/");
}

const binary: string =
	join(__dirname, "..") +
	`/bin/ncnn/realesrgan-ncnn-vulkan${
		process.platform === "win32" ? ".exe" : ""
	}`;

const threads: number = cpus().length;
const decode: number = _nonZeroAssignment(10);
const proc: number = _nonZeroAssignment(65);
const encode: number = _nonZeroAssignment(25);

export function upscale(
	input: string,
	output: string,
	level: LevelOptions,
): Promise<boolean> {
	//making absolute path
	input = resolve(relative(process.cwd(), input));

	output = resolve(relative(process.cwd(), output));

	/* constructing command with arguments */
	const commandArgs: Record<string, string | number> = {
		"-i": input,
		"-o": output,
		"-s": 4,
		"-n": level,
		"-j": `${decode}:${proc}:${encode}`,
	};

	const commandline: string = _commandConstrutor(binary, commandArgs);

	return new Promise((resolve, reject) => {
		exec(commandline)
			.on("exit", (code: number, signal: number) => {
				if (code === 0) {
					resolve(true);
				} else {
					reject(
						`Unexpected exit code: ${code} -|- signal: ${signal}\n${commandline}`,
					);
				}
			})
			.on("error", (err: Error) => {
				reject(err.message);
			});
	});
}

export async function upscaleAll(
	inputs: string[],
	basePath: string,
	level: LevelOptions,
	batchSize: number = 2,
): Promise<void> {
	console.log("Number of images in queue: " + inputs.length);
	console.log(
		"Number of cycles: " + Math.floor(inputs.length / batchSize),
	);
	console.log("Number of batches per cycle: " + batchSize);

	const outputPromises: (() => Promise<void>)[] = inputs.map(
		(input: string) => {
			return (): Promise<void> => {
				return new Promise((resolve, reject) => {
					const output: string = join(
						basePath,
						relative(process.cwd(), input),
					);

					upscale(input, output, level)
						.then((success: boolean) => {
							if (success) {
								resolve();
							} else {
								reject("Upscale failed: " + input);
							}
						})
						.catch((err: Error) => {
							reject(err);
						});
				});
			};
		},
	);

	//batching
	const promiseBatches: (() => Promise<void>)[][] = [];

	for (let i: number = 0; i < outputPromises.length; i += batchSize) {
		promiseBatches.push(outputPromises.slice(i, i + batchSize));
	}

	/* Resolving batches */
	for (const batch of promiseBatches) {
		const activatedBatch: Promise<void>[] = batch.map((func) => func());

		try {
			await Promise.all(activatedBatch);
		} catch (error) {
			console.log(error);
			process.exit(1);
		}
	}
}
