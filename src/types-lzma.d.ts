declare module "lzma" {
  export function compress(input: string | Buffer | Uint8Array | number[], mode?: number): number[] | Uint8Array;
  export function decompress(input: Buffer | Uint8Array | number[]): string | Uint8Array;
}
