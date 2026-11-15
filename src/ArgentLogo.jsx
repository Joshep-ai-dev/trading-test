import React from 'react';
import mark from '../argent-mark.svg';

export default function ArgentLogo() {
  return <>
    <img className="argent-mark" src={mark} width="36" height="36" alt="" aria-hidden="true"/>
    <span className="argent-wordmark">argent<span className="argent-signature" aria-hidden="true"/></span>
  </>;
}
