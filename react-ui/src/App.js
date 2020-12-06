import React from 'react';
import { BrowserRouter as Router, Switch, Route } from 'react-router-dom';
import Login from './components/LoginAndRegistration/Login'
import Registration from './components/LoginAndRegistration/Registration';
import ForgotPassword from './components/LoginAndRegistration/ForgotPassword';
import ResetPassword from './components/LoginAndRegistration/ResetPassword';
import DuoLogin from './components/LoginAndRegistration/DuoLogin';
import Dashboard from './components/Dashboard/Dashboard';
import LandingPage from './components/LoginAndRegistration/LandingPage/LandingPage';
import { createMuiTheme, ThemeProvider } from '@material-ui/core/styles';

function App() {

  const paletteType = "light";
  const mainPrimaryColor = '#ADEFD1';
  const mainSecondaryColor = '#394C5E';

  const theme = createMuiTheme({
    palette: {
      primary: {
        main: mainPrimaryColor,
      },
      secondary: {
        main: mainSecondaryColor,
      },
      type: paletteType,
    },
  });
  return (
    <ThemeProvider theme={theme}>
      <Router>
          <Switch>
            <Route path="/" exact component={LandingPage} />
            <Route path="/login" exact component={Login} />
            <Route path='/registration' component={Registration} />
            <Route path='/forgotpassword' component={ForgotPassword} />
            <Route path='/resetpassword/:token' component={ResetPassword} />
            <Route path='/dashboard' component={Dashboard} />
            <Route path='/duologin' component={DuoLogin} />
          </Switch>
        </Router>
    </ThemeProvider>
  );
}

export default App;
