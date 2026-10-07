export interface PhylogeneticTreeBranch {
  length?: unknown;
  children?: PhylogeneticTreeBranch[];
  [key: string]: any;
}

export interface ClampNegativeBranchLengthOptions {
  terminalOnly?: boolean;
}

/**
 * Neighbor-joining can estimate negative limb lengths even when the source
 * distance matrix is valid. Clamp those estimates before the tree is used for
 * patristic distances or serialized for a later MicrobeTrace import.
 */
export function clampNegativeBranchLengthsToZero(
  root: PhylogeneticTreeBranch | null | undefined,
  options: ClampNegativeBranchLengthOptions = {},
): number {
  if (!root) return 0;

  const terminalOnly = options.terminalOnly === true;
  const stack: PhylogeneticTreeBranch[] = [root];
  let clampedCount = 0;

  while (stack.length > 0) {
    const branch = stack.pop()!;
    const children = Array.isArray(branch.children) ? branch.children : [];
    const canClamp = !terminalOnly || children.length === 0;

    if (canClamp && typeof branch.length === 'number' && branch.length < 0) {
      branch.length = 0;
      clampedCount++;
    }

    for (let i = children.length - 1; i >= 0; i--) {
      stack.push(children[i]);
    }
  }

  return clampedCount;
}
