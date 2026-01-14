import type { Pointer } from "@ethdebug/format";
import type { Machine } from "#machine";
import type { Cursor } from "#cursor";
import type { Data } from "#data";

import { Memo } from "./memo.js";
import { processPointer, type ProcessOptions } from "./process.js";

/**
 * Upfront information needed for generating the concrete Cursor.Regions
 * for a particular pointer at runtime.
 */
export interface GenerateRegionsOptions {
  templates: Pointer.Templates;
  state: Machine.State;
  initialStackLength: bigint;
}

/**
 * Generator function that yields Cursor.Regions for a given Pointer.
 *
 * This function maintains an internal stack of memos to evaluate,
 * initially populating this stack with a single entry for evaluating the
 * given pointer.
 */
export async function* generateRegions(
  pointer: Pointer,
  generateRegionsOptions: GenerateRegionsOptions,
): AsyncIterable<Cursor.Region> {
  const options = await initializeProcessOptions(generateRegionsOptions);

  // extract records for mutation
  const { regions, variables } = options;

  // Stack of rename mappings for template references with yields
  const renameStack: Array<Record<string, string>> = [];

  // Stack of template definitions for inline templates
  const templatesStack: Array<Pointer.Templates> = [];

  const stack: Memo[] = [Memo.dereferencePointer(pointer)];
  while (stack.length > 0) {
    const memo: Memo = stack.pop() as Memo;

    let memos: Memo[] = [];
    switch (memo.kind) {
      case "dereference-pointer": {
        // Merge inline templates with base templates (inline takes precedence)
        const currentTemplates = templatesStack.reduce(
          (acc, templates) => ({ ...acc, ...templates }),
          options.templates,
        );

        // Process the pointer, intercepting yielded regions to apply renames
        const process = processPointer(memo.pointer, {
          ...options,
          templates: currentTemplates,
        });
        let result = await process.next();
        while (!result.done) {
          let region = result.value;

          // Apply rename if in context and region has a name in mapping
          const currentMapping = renameStack[renameStack.length - 1];
          if (currentMapping && region.name) {
            const newName = currentMapping[region.name];
            if (newName && newName !== region.name) {
              region = { ...region, name: newName };
            }
          }

          yield region;
          result = await process.next();
        }
        memos = result.value;
        break;
      }
      case "save-regions": {
        for (const [name, region] of Object.entries(memo.regions)) {
          // Save under original name for internal reference resolution
          regions[name] = region;
        }
        break;
      }
      case "save-variables": {
        Object.assign(variables, memo.variables);
        break;
      }
      case "push-region-renames": {
        renameStack.push(memo.mapping);
        break;
      }
      case "pop-region-renames": {
        // Apply renames when exiting the context: add mappings from
        // original names to new names for external reference resolution
        const mapping = renameStack.pop();
        if (mapping) {
          for (const [originalName, newName] of Object.entries(mapping)) {
            if (originalName in regions && newName !== originalName) {
              regions[newName] = { ...regions[originalName], name: newName };
            }
          }
        }
        break;
      }
      case "push-templates": {
        templatesStack.push(memo.templates);
        break;
      }
      case "pop-templates": {
        templatesStack.pop();
        break;
      }
    }

    // add new memos to the stack in reverse order
    for (let index = memos.length - 1; index >= 0; index--) {
      stack.push(memos[index]);
    }
  }
}

async function initializeProcessOptions({
  templates,
  state,
  initialStackLength,
}: GenerateRegionsOptions): Promise<ProcessOptions> {
  const currentStackLength = await state.stack.length;
  const stackLengthChange = currentStackLength - initialStackLength;

  const regions: Record<string, Cursor.Region> = {};
  const variables: Record<string, Data> = {};

  return {
    templates,
    state,
    stackLengthChange,
    regions,
    variables,
  };
}
