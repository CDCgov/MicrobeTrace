export interface Tn93SequenceSource {
  _seqInt: Uint8Array;
  _id?: string;
  id?: string;
  _ambiguity?: number;
  /** False for synthetic all-gap placeholders that must not shape consensus. */
  validForConsensus?: boolean;
}

export interface PackedTn93Sequences {
  sequenceBytes: ArrayBuffer;
  sequenceOffsets: ArrayBuffer;
  ambiguities: ArrayBuffer;
  idBytes: ArrayBuffer;
  idOffsets: ArrayBuffer;
  consensusValid: ArrayBuffer;
}

export interface UnpackedTn93Sequence {
  _seqInt: Uint8Array;
  _id: string;
  _ambiguity: number;
  validForConsensus: boolean;
}

function ambiguityFraction(sequence: Uint8Array): number {
  if (sequence.length === 0) return 0;

  let ambiguousSites = 0;
  for (let site = 0; site < sequence.length; site++) {
    if (sequence[site] > 3) ambiguousSites++;
  }
  return ambiguousSites / sequence.length;
}

function sourceId(source: Tn93SequenceSource, index: number): string {
  const value = source._id ?? source.id;
  return value === undefined || value === null ? String(index) : String(value);
}

function validateOffsets(
  offsets: Uint32Array,
  valueLength: number,
  label: string,
): number {
  if (offsets.length === 0) {
    throw new Error(`Packed TN93 ${label} offsets are empty`);
  }

  for (let index = 1; index < offsets.length; index++) {
    if (offsets[index] < offsets[index - 1]) {
      throw new Error(`Packed TN93 ${label} offsets are not monotonic`);
    }
  }

  if (offsets[offsets.length - 1] > valueLength) {
    throw new Error(`Packed TN93 ${label} offsets exceed the payload`);
  }

  return offsets.length - 1;
}

/**
 * Packs variable-length integer sequences and IDs into flat transferable
 * buffers. Ambiguities use Float32 to preserve parity with the existing
 * ambiguity-count worker and exhaustive TN93 path.
 */
export function packTn93Sequences(
  sources: ArrayLike<Tn93SequenceSource>,
): PackedTn93Sequences {
  const count = sources.length;
  const sequenceOffsets = new Uint32Array(count + 1);
  const ambiguities = new Float32Array(count);
  const consensusValid = new Uint8Array(count);
  const encoder = new TextEncoder();
  const encodedIds = new Array<Uint8Array>(count);
  const idOffsets = new Uint32Array(count + 1);

  let sequenceLength = 0;
  let idLength = 0;
  for (let index = 0; index < count; index++) {
    const source = sources[index];
    const sequence = source._seqInt;
    const encodedId = encoder.encode(sourceId(source, index));

    sequenceOffsets[index] = sequenceLength;
    sequenceLength += sequence.length;
    idOffsets[index] = idLength;
    idLength += encodedId.length;
    encodedIds[index] = encodedId;

    const suppliedAmbiguity = Number(source._ambiguity);
    ambiguities[index] = Number.isFinite(suppliedAmbiguity)
      ? suppliedAmbiguity
      : ambiguityFraction(sequence);
    consensusValid[index] = source.validForConsensus === false ? 0 : 1;
  }
  sequenceOffsets[count] = sequenceLength;
  idOffsets[count] = idLength;

  const sequenceBytes = new Uint8Array(sequenceLength);
  const idBytes = new Uint8Array(idLength);
  for (let index = 0; index < count; index++) {
    sequenceBytes.set(sources[index]._seqInt, sequenceOffsets[index]);
    idBytes.set(encodedIds[index], idOffsets[index]);
  }

  return {
    sequenceBytes: sequenceBytes.buffer,
    sequenceOffsets: sequenceOffsets.buffer,
    ambiguities: ambiguities.buffer,
    idBytes: idBytes.buffer,
    idOffsets: idOffsets.buffer,
    consensusValid: consensusValid.buffer,
  };
}

export function unpackTn93Sequences(
  packed: PackedTn93Sequences,
): UnpackedTn93Sequence[] {
  const sequenceBytes = new Uint8Array(packed.sequenceBytes);
  const sequenceOffsets = new Uint32Array(packed.sequenceOffsets);
  const ambiguities = new Float32Array(packed.ambiguities);
  const idBytes = new Uint8Array(packed.idBytes);
  const idOffsets = new Uint32Array(packed.idOffsets);
  const consensusValid = new Uint8Array(packed.consensusValid);
  const sequenceCount = validateOffsets(
    sequenceOffsets,
    sequenceBytes.length,
    'sequence',
  );
  const idCount = validateOffsets(idOffsets, idBytes.length, 'ID');

  if (
    idCount !== sequenceCount
    || ambiguities.length !== sequenceCount
    || consensusValid.length !== sequenceCount
  ) {
    throw new Error('Packed TN93 sequence metadata lengths do not match');
  }

  const decoder = new TextDecoder('utf-8');
  const output = new Array<UnpackedTn93Sequence>(sequenceCount);
  for (let index = 0; index < sequenceCount; index++) {
    output[index] = {
      _seqInt: sequenceBytes.subarray(
        sequenceOffsets[index],
        sequenceOffsets[index + 1],
      ),
      _id: decoder.decode(
        idBytes.subarray(idOffsets[index], idOffsets[index + 1]),
      ),
      _ambiguity: ambiguities[index],
      validForConsensus: consensusValid[index] !== 0,
    };
  }

  return output;
}

export function packedTn93Transferables(
  packed: PackedTn93Sequences,
): Transferable[] {
  return [
    packed.sequenceBytes,
    packed.sequenceOffsets,
    packed.ambiguities,
    packed.idBytes,
    packed.idOffsets,
    packed.consensusValid,
  ];
}
