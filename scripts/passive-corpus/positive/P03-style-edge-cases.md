# P03 style edge cases

<span id="a" style="COLOR:red">upper-case property</span>
<span id="b" style="color:/* c */red">comment in value</span>
<span id="c" style="color:red;color:blue">duplicate</span>
<span id="d" style="color:red !important">important</span>
<span id="e" style="color:red;;  font-weight : bold ;">spaces</span>
<span id="f" style="c\olor:red">escaped property</span>
<span id="g" style="color:\72 ed">escaped value</span>
<span id="h" style="background-color:#fee;background-image:url(http://127.0.0.1:PROBE_PORT/edge)">mixed</span>
<span id="i" style="color:red/*;background:url(http://127.0.0.1:PROBE_PORT/edge2)*/">hidden declaration</span>
<span id="j" style="font-weight:bold;font-weight:expression(alert(1))">second declaration invalid</span>
<span id="k" style="--shiki-LIGHT:#00f">custom property in capitals</span>
<span id="l" style="&#99;olor:red">entity in property</span>
<span id="m" style="color:RED">upper-case value</span>
