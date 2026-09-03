import {
  packTn93Sequences,
  packedTn93Transferables,
  unpackTn93Sequences,
} from './tn93-worker-payload';

describe('packed TN93 worker payload', () => {
  it('round-trips variable-length sequences, UTF-8 IDs, and metadata', () => {
    const packed = packTn93Sequences([
      {
        _id: 'sample-α',
        _seqInt: Uint8Array.from([0, 1, 2]),
        _ambiguity: 0.1,
      },
      {
        id: 'sample-2',
        _seqInt: Uint8Array.from([3, 17]),
        validForConsensus: false,
      },
    ]);
    const unpacked = unpackTn93Sequences(packed);

    expect(Array.from(unpacked[0]._seqInt)).toEqual([0, 1, 2]);
    expect(Array.from(unpacked[1]._seqInt)).toEqual([3, 17]);
    expect(unpacked[0]._id).toBe('sample-α');
    expect(unpacked[1]._id).toBe('sample-2');
    expect(unpacked[0]._ambiguity).toBeCloseTo(0.1, 5);
    expect(unpacked[1]._ambiguity).toBe(0.5);
    expect(unpacked[0].validForConsensus).toBeTrue();
    expect(unpacked[1].validForConsensus).toBeFalse();
    expect(packedTn93Transferables(packed)).toEqual([
      packed.sequenceBytes,
      packed.sequenceOffsets,
      packed.ambiguities,
      packed.idBytes,
      packed.idOffsets,
      packed.consensusValid,
    ]);
  });

  it('handles an empty sequence collection', () => {
    expect(unpackTn93Sequences(packTn93Sequences([]))).toEqual([]);
  });

  it('rejects inconsistent metadata lengths', () => {
    const packed = packTn93Sequences([
      { _seqInt: Uint8Array.from([0]), _id: 'one' },
    ]);
    packed.consensusValid = new ArrayBuffer(0);

    expect(() => unpackTn93Sequences(packed))
      .toThrowError('Packed TN93 sequence metadata lengths do not match');
  });
});
