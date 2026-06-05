declare module "lzma" {
  export function decompress(input: Buffer | Uint8Array | number[]): string | Uint8Array;
}
