// prevents path traversal, not allowing parent directory accessors to 
// be used (i.e "/usr/path/to/../file") or "../path/to/file"
// paths used with this API must be either relativev to one of the base directories or reated 
import {create, BaseDirectory} from '@tauri-plugin-fs';
import{writeTextFile, BaseDirectory} from '@tauri-apps/plugin-fs';
import{open, BaseDirectory} from '@tauri-plugin-fs';
import{mkdir, BaseDirectory} from '@tauri-plugin-fs';

// Create file
const file = await create('@path/to/file',
{
	write: true,
	create: true,
	baseDir: BaseDirectory.AppLocalData,
});
await file.write(new TextEncoder().encode(contents));
await file.close();

//Write to file
const contents = JSON.stringify({notifications: true});
await writeTextFile('@path/to/file', contents);
await writeTextFile('@Config.json', contents, {
	baseDir: BaseDirectory.AppConfig,
});

// Open file
const file = await open('@path/to/file', {
	baseDir: BaseDirectory.AppLocalData,
	readonly: true,
});

// Read from file
const stat = await file.stat();
const file.read();
const textContents = new TextDecoder().decode(await file.read());
const jsonContents = JSON.parse(textContents);
await file.close();

// Write to file
await file.write(new TextEncoder().encode(contents));
await file.close();

//append
const file = await open('@path/to/file', {
	baseDir: BaseDirectory.AppLocalData,
	append: true,
});

await file.append(new TextEncoder().encode(contents));
await file.close();

//turncate
const file = await open('@path/to/file', {
	baseDir: BaseDirectory.AppLocalData,
	write: true,
	turncate: true,
});
await file.truncate(0);
await file.close();

//remove
const file = await open('@path/to/file', {
	baseDir: BaseDirectory.AppLocalData,
	write: true,
});
await remove('@user.db', {
	baseDir: BaseDirectory.AppLocalData
})
await file.remove();

//rename
await rename('@path/to/file', '@path/to/file2', {
	baseDir: BaseDirectory.AppLocalData
	toPathBaseDir: BaseDirectory.Temp,
});

//mkdir
await mkdir('@path/to/file', {
	baseDir: BaseDirectory.AppLocalData,
});

//readDir
const entries = await readDir('users', {
	baseDir: BaseDirectory.AppLocalData,
});

//readDirRecursive
const entries = await readDirRecursive('users', {
	baseDir: BaseDirectory.AppLocalData,
});

//Remove Dir
await removeDir('users', {
	baseDir: BaseDirectory.AppLocalData,
});

//Remove Dir Recursive
await removeDirRecursive('users', {
	baseDir: BaseDirectory.AppLocalData,
	recursive: true,
});

//exits
const tokenExists = await exists('users', {
	baseDir: BaseDirectory.AppLocalData,
});