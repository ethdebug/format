import React from 'react';
import isInternalUrl from '@docusaurus/isInternalUrl';
import MDXComponents from '@theme-original/MDXComponents';
import MDXA  from "@theme-original/MDXComponents/A";
import type { Props as LinkProps } from "@docusaurus/Link";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'; // Import the FontAwesomeIcon component.
import { library } from '@fortawesome/fontawesome-svg-core'; // Import the library component.
import { fab } from '@fortawesome/free-brands-svg-icons'; // Import all brands icons.
import { fas } from '@fortawesome/free-solid-svg-icons'; // Import all solid icons.
import IconExternalLink from "@theme-original/Icon/ExternalLink";

library.add(fab, fas); // Add all icons to the library so you can use them without importing them individually.

// custom link component that appends external link svg inside Markdown files
function A({ children, href, ...props }: LinkProps): JSX.Element {
  return <MDXA href={href} {...props}>
    {children}
    {href && !isInternalUrl(href) && (
      <IconExternalLink />
    )}
  </MDXA>
}
export default {
  // Re-use the default mapping
  ...MDXComponents,
  a: A,
  Icon: FontAwesomeIcon, // Make the FontAwesomeIcon component available in MDX as <icon />.
};
