import { Link as MuiLink, Paper, Button, Grid, TextField, Typography } from '@material-ui/core';
import React, { useState } from 'react'
import useForm from './useForm';
import axios from 'axios';
import { Link } from 'react-router-dom';
import Navbar from './Navbar';
import FacebookLogin from 'react-facebook-login';

const initialValues = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  confirmPassword: '',
}

export default function Registration(props) {

  const {
    values,
    handleInputChange,
    useStyle
  } = useForm(initialValues);

  const classes = useStyle();

  const onSubmit = (e) => {
    e.preventDefault();
    if (values.password !== values.confirmPassword) {
      window.alert("Password is not the same");
    } 
    else {
      //Attempts to insert the given values into the database
      axios.post('/users', values)
        .then(res => {
          //If User creation was successful
          if(res.status === 201){
            alert("Account created successfully");
            //Redirects to the login page
            props.history.push('/login');
          }
          //If the given email is already in use
          else if(res.status === 409){
            alert("This email has already been taken");
          }
        })
        //Catches another undefined error
        .catch(err => {
            alert(err.response.data);
        });
    }
  };

  /* 
  window.fbAsyncInit = function() {
    FB.init({
      appId      : '350577486197278',
      xfbml      : true,
      version    : 'v8.0'
    });
    FB.AppEvents.logPageView();
  };
  (function(d, s, id){
     var js, fjs = d.getElementsByTagName(s)[0];
     if (d.getElementById(id)) {return;}
     js = d.createElement(s); js.id = id;
     js.src = "https://connect.facebook.net/en_US/sdk.js";
     fjs.parentNode.insertBefore(js, fjs);
   }(document, 'script', 'facebook-jssdk'));
   */
/*
  const [login, setLogin] = useState(false);
  const [data, setData] = useState({});
  const [email, setEmail] = useState({});
  const responseFacebook = (response) => {
    console.log(response);
    setData(response);
    setEmail(response);
    if (response.accessToken) {
      setLogin(true);
      console.log(login);
      console.log(data);
      console.log(email);
    } else {
      setLogin(false);
    }
  }
*/
  const responseFacebook = (response) => {
    const data = {
      email: response.email,
      name: response.name,
      fbID: response.userID,
      token: response.accessToken,
      signedRequest: response.signedRequest
    };

    axios.post('/authenticate/facebook', data)
      .then(res => {
        if (res.status === 200) {
          props.history.push('/duologin');
        }
      })
      .catch(err => {
        alert(err.response.data);
      });
  };

  return (
    <>
      <Navbar />
      <Paper className={classes.paperContent}>
        <form className={classes.root}>
          <Grid container justify="center">
            <Typography variant="h2" color="secondary" className={classes.extraItemsForm}>Create Account</Typography>
          </Grid>
          <Grid container justify="center">
            <TextField color="secondary" variant="outlined" label="First Name" name="firstName" value={values.firstName} onChange={handleInputChange} className={classes.textFieldForm}/>
            <TextField color="secondary" variant="outlined" label="Last Name" name="lastName" value={values.lastName} onChange={handleInputChange} className={classes.textFieldForm}/>
            <TextField color="secondary" variant="outlined" label="Email" name="email" value={values.email} onChange={handleInputChange} className={classes.textFieldForm} />
            <TextField color="secondary" variant="outlined" label="Password" name="password" type="password" value={values.password} onChange={handleInputChange} className={classes.textFieldForm} />
            <TextField color="secondary" variant="outlined" label="Confirm Password" name="confirmPassword" type="password" value={values.confirmPassword} onChange={handleInputChange} className={classes.textFieldForm} />
          </Grid>
          <Grid container justify="center">
            <Button color="primary" variant="contained" size="large" onClick={onSubmit} className={classes.extraItemsForm}>Submit</Button>
          </Grid>
          <Grid container justify="center">
           <FacebookLogin appId="350577486197278" autoLoad={false} fields="name,email,picture" callback={responseFacebook} className={classes.extraItemsForm} />
          </Grid>
          <Grid container justify="center">
            <MuiLink component={Link} to="/login" color="secondary" variant="body1" className={classes.links}>Already have an account?</MuiLink>
          </Grid>
          <Grid container justify="center">
            <MuiLink component={Link} to="/forgotpassword" color="secondary" variant="body1" className={classes.links}>Forgot password?</MuiLink>
          </Grid>
        </form>
      </Paper>
    </>
  );
}
