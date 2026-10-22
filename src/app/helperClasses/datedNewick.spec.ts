import * as patristic from 'patristic';
import {
  AUSPICE_NUM_DATE_STORAGE_KEY,
  parseDatedNewick,
} from './datedNewick';

describe('dated Newick parser', () => {
  const getNumDate = (node: any): number | undefined => (
    node?.data?.[AUSPICE_NUM_DATE_STORAGE_KEY]?.value
  );

  it('extracts explicit dates on every node and returns comment-free Newick', () => {
    const parsed = parseDatedNewick(
      '(A:2[&num_date=2024],B:2.5[&num_date=2024.5])ROOT:0[&num_date=2022];',
    );

    expect(parsed).not.toBeNull();
    expect(parsed!.annotatedNodeCount).toBe(3);
    expect(parsed!.totalNodeCount).toBe(3);
    expect(parsed!.complete).toBeTrue();
    expect(parsed!.sanitizedNewick).toBe('(A:2,B:2.5)ROOT:0;');
    expect(getNumDate(parsed!.tree)).toBe(2022);
    expect(getNumDate(parsed!.tree.children![0])).toBe(2024);
    expect(getNumDate(parsed!.tree.children![1])).toBe(2024.5);

    const displayTree = patristic.parseNewick(parsed!.sanitizedNewick);
    expect(displayTree.getLeaves().map((leaf: any) => leaf.id)).toEqual(['A', 'B']);
  });

  it('supports node annotations before branch lengths and unnamed internal nodes', () => {
    const parsed = parseDatedNewick(
      '((A[&num_date=2024]:2,B[&num_date=2025]:3)[&num_date=2022]:1,C[&num_date=2026]:5)'
      + '[&num_date=2021];',
    );

    expect(parsed?.complete).toBeTrue();
    expect(parsed?.totalNodeCount).toBe(5);
    expect(parsed?.tree.id).toBe('');
    expect(getNumDate(parsed?.tree)).toBe(2021);
    expect(getNumDate(parsed?.tree.children?.[0])).toBe(2022);
    expect(getNumDate(parsed?.tree.children?.[0].children?.[0])).toBe(2024);
  });

  it('reports incomplete explicit dates without filling the missing nodes', () => {
    const parsed = parseDatedNewick('(A:1[&num_date=2024],B:1)ROOT:0[&num_date=2023];');

    expect(parsed?.annotatedNodeCount).toBe(2);
    expect(parsed?.totalNodeCount).toBe(3);
    expect(parsed?.complete).toBeFalse();
    expect(getNumDate(parsed?.tree.children?.[1])).toBeUndefined();
  });

  it('does not classify ordinary or malformed Newick as explicitly dated', () => {
    expect(parseDatedNewick('(A:1,B:1)ROOT;')).toBeNull();
    expect(parseDatedNewick('(A:1[&num_date=bad],B:1)ROOT;')).not.toBeNull();
    expect(parseDatedNewick('(A:1[&num_date=2024],B:1)ROOT')).not.toBeNull();
    expect(parseDatedNewick('(A:1[&num_date=2024],B:1)ROOT]')).toBeNull();
  });
});
