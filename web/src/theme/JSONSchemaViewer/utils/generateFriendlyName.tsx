import React from 'react';
import GenerateFriendlyName from '@theme-original/JSONSchemaViewer/utils/generateFriendlyName';

export default function GenerateFriendlyNameWrapper(props) {
  const { schema } = props;

  // otherwise just use default rendering
  return (
    <>
      <GenerateFriendlyName {...props} />
      {
        "const" in schema
          ? <span>
              <> = </><code>{JSON.stringify(schema.const)}</code>
            </span>
          : <></>
      }
    </>
  );
}
