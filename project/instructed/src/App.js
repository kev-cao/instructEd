import React, { Component } from 'react';
import logo from './logo.svg';
import './App.css';
import Login from "./login";
import Registration from "./registration"

class App extends Component {
  render() {
    return (
      <div className="App">
        <Registration />
      </div>
    );
  }
}

export default App;
