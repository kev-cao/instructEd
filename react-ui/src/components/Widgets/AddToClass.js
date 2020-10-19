import React from 'react';
import { Paper, TextField, Grid, Button, FormControl, InputLabel, Select, MenuItem } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';

const useStyle = makeStyles(theme => ({
  items: {
    margin:theme.spacing(1)
  },
  root: {
    '& .MuiFormControl-root': {
      width:'75%',
      margin:theme.spacing(1),
      display:'flex'
    }
  },
}))

const onSubmit = (e) => {
  e.preventDefault();
};

export default function AddToClass() {
  const classes = useStyle();
  const [term, setTerm] = React.useState('');
  const [role, setRole] = React.useState('');


  const handleTermChange = (event) => {
    setTerm(event.target.value);
  };

  const handleRoleChange = (event) => {
    setRole(event.target.value);
  }

    return (
      <Paper className="root">
        <form>
          <Grid height="100%" spacing={1}>
            <Grid item xs="12">
              <TextField required color="secondary" variant="outlined" label="Class Number" name="classNumber" className={classes.items} />
            </Grid>
            <Grid item xs="12">
              <TextField required color="secondary" variant="outlined" label="Student" name="student" className={classes.items} />
            </Grid>
            <FormControl color="secondary" variant="outlined" className={classes.items}>
                <InputLabel id="demo-simple-select-outlined-label">Term</InputLabel>
                <Select
                  color="secondary"
                  style={{ width: 150 }}
                  value={term}
                  onChange={handleTermChange}
                  label="Term"
                >
                  <MenuItem value={10}>Spring 2021</MenuItem>
                  <MenuItem value={20}>Fall 2021</MenuItem>
                </Select>
              </FormControl>
              <FormControl color="secondary" variant="outlined" className={classes.items}>
                <InputLabel id="demo-simple-select-outlined-label">Role in Class</InputLabel>
                <Select
                  color="secondary"
                  style={{ width: 150 }}
                  value={role}
                  onChange={handleRoleChange}
                  label="Role in Class"
                >
                  <MenuItem value={10}>Instructor</MenuItem>
                  <MenuItem value={20}>Student</MenuItem>
                </Select>
              </FormControl>
            <Grid item xs="12">
              <Button variant="contained" color="secondary" className={classes.items} onSubmit={onSubmit}>Add Course </Button>
            </Grid>
          </Grid>
        </form>
      </Paper>
    );
}