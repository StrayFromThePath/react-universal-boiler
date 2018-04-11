import React from 'react';
import Link from 'react-router-dom/Link';
// $FlowIssue
import styles from './style.scss';

const Layout = props => (
  <div>
    <nav className={styles.navbar}>
      <div className={styles.wrapper}>
        <Link to="/tools">Tools</Link>
      </div>
    </nav>
    <main className="container">{props.children}</main>
  </div>
);

export default Layout;
