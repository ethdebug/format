import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'; // Import the FontAwesomeIcon component.
import IconExternalLink from "@theme/Icon/ExternalLink";

import styles from './index.module.css';

export default function Home(): JSX.Element {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={`Home`}
      description="ethdebug format homepage">
      <HomepageHeader />
      <main>
        <HomepageFeatures />
      </main>
    </Layout>
  );
}

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
      </div>
    </header>
  );
}

type FeatureItem = {
  title: string;
  description: JSX.Element;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Building a debugging standard',
    description: (
      <>
        <p>
          The <strong>ethdebug format</strong> group seeks to design a <Link
            to="http://en.wikipedia.org/wiki/Debugging_data_format"
          >
            debugging data format<IconExternalLink />
          </Link> suitable for smart contract languages.
        </p>

        <p>
          We hope to make this format easy for compilers to output directly and
          for debuggers to read.
        </p>
      </>
    ),
  },
  {
    title: 'Current status',
    description: (
      <>
        <p>
          The <strong>ethdebug format</strong> project is currently in design
          phase and seeking to onboard contributors with interest in this area.
          Our most immediate goals are to establish a v1 formal schema and
          to increase awareness of our efforts.
        </p>

        <p>
          The Ethereum Foundation and the Solidity team are graciously
          funding this effort with a keen interest in building a format that is
          compatible with current and future EVM languages.
        </p>
      </>
    ),
  },
  {
    title: 'Get involved',
    description: (
      <>
        <p>
          Join the <Link to="https://matrix.to/#/#ethdebug:matrix.org">
            Matrix.chat<IconExternalLink />
          </Link> or watch the <Link to="https://github.com/ethdebug/format">
            GitHub repo<IconExternalLink />
          </Link> to follow along with our ongoing development.
        </p>

        <p>
          Our group (including individuals and members of teams including Solidity
          and Tenderly) meets every two weeks on Thursdays at 17:00 Berlin time.
          Meetings are announced in our Matrix.chat, but please reach out if
          you'd like a calendar invite.
        </p>
      </>
    ),
  },
];

function Feature({title, description}: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <>{description}</>
      </div>
    </div>
  );
}

function HomepageFeatures(): JSX.Element {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
