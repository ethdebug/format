import React from "react";
import isInternalUrl from "@docusaurus/isInternalUrl";
import MDXComponents from "@theme-original/MDXComponents";
import MDXA from "@theme-original/MDXComponents/A";
import type { Props as LinkProps } from "@docusaurus/Link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { library } from "@fortawesome/fontawesome-svg-core";
import { fab } from "@fortawesome/free-brands-svg-icons";
import { fas } from "@fortawesome/free-solid-svg-icons";
import IconExternalLink from "@theme-original/Icon/ExternalLink";
import StatusBadge from "@site/src/components/StatusBadge";
import StatusBanner from "@site/src/components/StatusBanner";

library.add(fab, fas); // Add all icons to the library so you can use them without importing them individually.

// custom link component that appends external link svg inside Markdown files
function A({ children, href, ...props }: LinkProps): JSX.Element {
  return (
    <MDXA href={href} {...props}>
      {children}
      {href && !isInternalUrl(href) && (
        <>
          &#xfeff;
          <IconExternalLink />
        </>
      )}
    </MDXA>
  );
}

export default {
  // Re-use the default mapping
  ...MDXComponents,
  a: A,
  Icon: FontAwesomeIcon,
  StatusBadge,
  StatusBanner,
};
