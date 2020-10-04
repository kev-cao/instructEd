import React, { useState } from 'react'
import axios from 'axios'; 
import { Link as MuiLink, Button, Typography, Grid, TextField, Paper } from '@material-ui/core';
import useForm from './useForm';
import { Link } from 'react-router-dom';
import Navbar from './Navbar';
import FacebookLogin from 'react-facebook-login';

const initialValues = {
  email: '',
  password: ''
}

export default function Login(props) {
  
  const {
    values,
    handleInputChange,
    useStyle
  } = useForm(initialValues);

  const classes = useStyle();

  const onSubmit = (e) => {
    e.preventDefault();
    axios.post("/authenticate", values)
      .then(res => {
        if (res.status === 200) {
          props.history.push('/duologin');
        }
      })
      .catch(err => {
        alert(err.response.data);
      });
  };

  const responseFacebook = (response) => {
    console.log(response);
  };

  return (
    <>
      <Navbar />
      <Paper className={classes.paperContent}>
        <form className={classes.root}>
          <Grid container justify="center">
            <Typography variant="h2" color="primary" className={classes.extraItemsForm}>Login</Typography>
          </Grid>
          <Grid container justify="center">
            <TextField variant="outlined" label="Email" name="email" value={values.email} onChange={handleInputChange} className={classes.textFieldForm} />
            <TextField variant="outlined" label="Password" name="password" type="password" value={values.password} onChange={handleInputChange} className={classes.textFieldForm} />
          </Grid>
          <Grid container justify="center">
            <Button variant="contained" size="large" color="primary" onClick={onSubmit} className={classes.extraItemsForm}>Submit</Button>
          </Grid>
          <Grid container justify="center">
            <FacebookLogin appId={process.env.FACEBOOK_CLIENT_ID} autoLoad={false} fields="name,email,picture" callback={responseFacebook} className={classes.extraItemsForm} />
          </Grid>
          <Grid container justify="center">
            <MuiLink component={Link} to="/registration" variant="body1" color="primary" className={classes.links}>Sign up for an account</MuiLink>
          </Grid>
          <Grid container justify="center">
            <MuiLink component={Link} to="/forgotpassword" variant="body1" color="primary" className={classes.links}>Forgot password?</MuiLink>
          </Grid>
        </form>
      </Paper>
    </>
  );
}
