// @flow
import * as React from 'react';
import {ButtonGroup, Col, Grid, Navbar, Panel, Row} from 'react-bootstrap';
import './App.css';
import {connect} from 'react-redux';
import {
  localUrlFromVersion,
  requestOngoingVersions,
  requestPollbotVersion,
  requestStatus,
  setVersion,
  submitVersion,
  updateUrl,
  updateVersionInput,
} from './actions.js';
import type {
  APIVersionData,
  CheckResult,
  CheckResults,
  Dispatch,
  OngoingVersions,
  ReleaseInfo,
  State,
  Status,
} from './types.js';

const deliveryDashboardVersionData: APIVersionData = require('./version.json');

function requestNotificationPermission(): void {
  if (
    Notification.permission !== 'denied' &&
    Notification.permission !== 'granted'
  ) {
    Notification.requestPermission();
  }
}

const parseUrl = (
  url: string,
): ?{service: string, product: string, version: string} => {
  const re = /^#(\w+)\/(\w+)\/([^/]+)\/?/; // Eg: #pollbot/firefox/50.0
  const parsed: ?(string[]) = url.match(re);
  if (!parsed) {
    return null;
  }
  const [_, service, product, version] = parsed;
  return {
    service: service,
    product: product,
    version: version,
  };
};

type ConnectedAppProps = {
  checkResults: CheckResults,
  dispatch: Dispatch,
  pollbotVersion: APIVersionData,
};
class ConnectedApp extends React.Component<ConnectedAppProps, void> {
  refreshIntervalId: ?number;

  constructor(props: ConnectedAppProps): void {
    super(props);
    this.refreshIntervalId = null;
  }

  setUpAutoRefresh(): void {
    if (this.shouldRefresh()) {
      if (this.refreshIntervalId) {
        // The auto-refresh is already enabled.
        return;
      }
      this.refreshIntervalId = setInterval(
        () => this.props.dispatch(requestStatus()),
        60000,
      );
    } else {
      this.stopAutoRefresh();
    }
  }

  stopAutoRefresh(): void {
    if (this.refreshIntervalId) {
      clearInterval(this.refreshIntervalId);
      this.refreshIntervalId = null;
    }
  }

  shouldRefresh(): boolean {
    const checkTitles = Object.keys(this.props.checkResults);
    const failingChecks = checkTitles.filter(
      title => this.props.checkResults[title].status !== 'exists',
    );
    return failingChecks.length !== 0;
  }

  componentDidMount(): void {
    this.props.dispatch(requestPollbotVersion());
    this.props.dispatch(requestOngoingVersions());
    this.setUpAutoRefresh();
    // Setup notifications.
    requestNotificationPermission();
    // Listen to url hash changes.
    window.onhashchange = this.versionFromHash;
    // Check if we have a version in the url.
    this.versionFromHash();
  }

  componentDidUpdate(): void {
    this.setUpAutoRefresh();
  }

  componentWillUnmount(): void {
    this.stopAutoRefresh();
  }

  versionFromHash = (): void => {
    const parsedUrl = parseUrl(window.location.hash);
    if (parsedUrl) {
      const version = parsedUrl.version;
      this.props.dispatch(requestStatus(version));
    }
  };

  render() {
    return (
      <div>
        <Navbar collapseOnSelect fluid>
          <Navbar.Header>
            <Navbar.Brand>
              <a href=".">Delivery Dashboard</a>
            </Navbar.Brand>
          </Navbar.Header>
        </Navbar>
        <Grid fluid>
          <Row>
            <Col sm={9}>
              <VersionInput />
              <CurrentRelease />
            </Col>
            <Col sm={3} className="firefox-releases-menu">
              <Panel header={<strong>Firefox Releases</strong>}>
                <SideBar />
              </Panel>
            </Col>
          </Row>
        </Grid>
        <footer>
          <p className="text-muted">
            Delivery dashboard version:{' '}
            <VersionLink versionData={deliveryDashboardVersionData} />
            &nbsp;--&nbsp;Pollbot version:{' '}
            <VersionLink versionData={this.props.pollbotVersion} />
          </p>
        </footer>
      </div>
    );
  }
}
const App = connect(
  // mapStateToProps
  (state: State) => ({
    checkResults: state.checkResults,
    pollbotVersion: state.pollbotVersion,
  }),
  // mapDispatchToProps
  null,
)(ConnectedApp);

const VersionInput = connect(
  // mapStateToProps
  (state: State) => ({
    value: state.versionInput,
  }),
  // mapDispatchToProps
  (dispatch: Dispatch) => ({
    onSubmit: (e: SyntheticEvent<HTMLInputElement>): void => {
      e.preventDefault();
      dispatch(submitVersion());
      dispatch(updateUrl());
    },
    handleSearchBoxChange: (e: SyntheticEvent<HTMLInputElement>): void => {
      dispatch(updateVersionInput(e.currentTarget.value));
    },
    handleDismissSearchBoxVersion: (): void => {
      window.location.hash = '';
      dispatch(setVersion(''));
    },
  }),
)(SearchForm);

type SearchFormProps = {
  onSubmit: (e: SyntheticEvent<HTMLInputElement>) => void,
  handleSearchBoxChange: (e: SyntheticEvent<HTMLInputElement>) => void,
  handleDismissSearchBoxVersion: () => void,
  value: string,
};

function SearchForm({
  onSubmit,
  handleSearchBoxChange,
  handleDismissSearchBoxVersion,
  value,
}: SearchFormProps) {
  return (
    <form className="search-form well" onSubmit={onSubmit}>
      <ClearableTextInput
        onChange={handleSearchBoxChange}
        onClick={handleDismissSearchBoxVersion}
        value={value}
      />
    </form>
  );
}

type ClearableTextInputProps = {
  onChange: (e: SyntheticEvent<HTMLInputElement>) => void,
  onClick: () => void,
  value: string,
};

function ClearableTextInput({
  onChange,
  onClick,
  value,
}: ClearableTextInputProps) {
  return (
    <ButtonGroup className="clearable-text">
      <input
        className="form-control"
        onChange={onChange}
        placeholder={'Firefox version, eg. "57.0"'}
        type="search"
        value={value}
      />
      <span className="text-clear-btn" onClick={onClick}>
        <i className="glyphicon glyphicon-remove" />
      </span>
    </ButtonGroup>
  );
}

function Spinner() {
  return <div className="loader" />;
}

const SideBar = connect(
  // mapStateToProps
  (state: State) => ({
    versions: state.latestChannelVersions,
  }),
  // mapDispatchToProps
  null,
)(ReleasesMenu);

function ReleasesMenu({versions}: {versions: OngoingVersions}) {
  let releasesMenu = <Spinner />;
  if (versions) {
    const {nightly, beta, release, esr} = versions;
    releasesMenu = (
      <ul>
        <ReleaseItem title="Nightly" version={nightly} />
        <ReleaseItem title="Beta" version={beta} />
        <ReleaseItem title="Release" version={release} />
        <ReleaseItem title="ESR" version={esr} />
      </ul>
    );
  }
  return releasesMenu;
}

function ReleaseItem({title, version}: {title: string, version: string}) {
  return (
    <li key={title}>
      <a href={localUrlFromVersion(version)}>{title + ': ' + version}</a>
    </li>
  );
}

const CurrentRelease = connect(
  // mapStateToProps
  (state: State) => ({
    checkResults: state.checkResults,
    releaseInfo: state.releaseInfo,
    version: state.version,
  }),
  // mapDispatchToProps
  null,
)(Dashboard);

type DashboardPropType = {
  checkResults: CheckResults,
  releaseInfo: ?ReleaseInfo,
  version: string,
};

function Dashboard({releaseInfo, checkResults, version}: DashboardPropType) {
  if (version === '') {
    return (
      <p>
        Learn more about a specific version.
        <strong> Select or enter your version number.</strong>
      </p>
    );
  } else if (!releaseInfo) {
    return <Spinner />;
  } else {
    return (
      <div>
        <h2>Channel: {releaseInfo.channel}</h2>
        <div className="dashboard">
          {releaseInfo.checks.map(check =>
            // Map on the checklist to display the results in the same order.
            DisplayCheckResult(check.title, checkResults[check.title]),
          )}
        </div>
      </div>
    );
  }
}

function DisplayCheckResult(title: string, checkResult: ?CheckResult) {
  return (
    <div className="panel panel-default" key={title}>
      <div className="panel-body">
        <h2>{title}</h2>
        {checkResult ? (
          <DisplayStatus
            status={checkResult.status}
            message={checkResult.message}
            url={checkResult.link}
          />
        ) : (
          <Spinner />
        )}
      </div>
    </div>
  );
}

function DisplayStatus({
  status,
  message,
  url,
}: {
  status: Status,
  message: string,
  url: string,
}) {
  const statusToLabelClass = {
    error: 'label-warning',
    exists: 'label-success',
    incomplete: 'label-info',
    missing: 'label-danger',
  };
  const labelText = status === 'error' ? 'Error: ' + message : status;
  return (
    <a
      className={'label ' + statusToLabelClass[status]}
      title={message}
      href={url}
    >
      {labelText}
    </a>
  );
}

function VersionLink({versionData}: {versionData: APIVersionData}) {
  if (!versionData) {
    return null;
  }
  const {commit, source, version} = versionData;
  const sourceUrl = source.replace(/\.git/, '');
  const url = `${sourceUrl}/commit/${commit}`;
  return <a href={url}>{version}</a>;
}

export default App;
