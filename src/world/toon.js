// Gentle cel shading for every lit material, done once, centrally, by rewriting three.js's shared
// lighting shader chunks before anything compiles. Every MeshStandardMaterial and MeshLambertMaterial in
// the game picks it up on its own: nothing has to be traversed or registered. Imported first by
// src/world/sky.js.
//
// - Sunlight (the moon at night) is eased toward soft-edged flat bands (lit, half-lit, shade), so a
//   surface reads as a few broad tones instead of a smooth gradient. TOON_BAND sets how far.
// - The sun's cast shadow gets a crisp edge but keeps its strength (sky.js still sets it, and fades the
//   moon's shadow at night).
// - Lamps, the torch and the fire are left smooth and untouched, so the night lighting stays as it was.
// - What the sun does not reach is pulled a little toward the hemisphere light's sky colour (keeping
//   its brightness), so shade reads slightly cool rather than grey. TOON_COOL sets how far.
// - Fog is aerial perspective: the haze also takes some colour out of what it covers, so far hills
//   turn into pale, soft silhouettes while the near ground keeps its colour.
import * as THREE from 'three';

const TOON_BAND = 0.6; // 0 = plain Lambert, 1 = hard bands
const TOON_COOL = 0.35; // 0 = neutral shade, 1 = shade fully in the sky's hue
const TOON_HAZE_DESAT = 0.45; // how much of the haze's strength goes to draining colour first

const C = THREE.ShaderChunk;
const swap = (src, from, to) => {
  if (!src.includes(from)) throw new Error(`toon: shader chunk changed, cannot find: ${from.slice(0, 60)}`);
  return src.replace(from, to);
};

C.lights_pars_begin += /* glsl */`
float toonShadow = 1.0;   // the sun's crisp shadow at this fragment (1 = in the light)
bool toonIsSun = false;   // the direct light being added is the sun (or moon)
float toonSunLit = 0.0;   // how much the sun reaches this fragment: 0 shade .. 1 lit
float toonBand( const in float d ) {
	return 0.5 * smoothstep( 0.0, 0.06, d ) + 0.5 * smoothstep( 0.22, 0.32, d );
}
float toonDirect( const in float dotNL ) {
	if ( ! toonIsSun ) return dotNL; // lamps, torch and fire stay smooth
	float lit = mix( dotNL, toonBand( dotNL ), ${TOON_BAND.toFixed(2)} ) * toonShadow;
	toonSunLit = max( toonSunLit, smoothstep( 0.0, 0.3, dotNL ) * toonShadow );
	return lit;
}
`;

const DOTNL = 'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );';
const TOON_DOTNL = 'float dotNL = toonDirect( saturate( dot( geometryNormal, directLight.direction ) ) );';
C.lights_lambert_pars_fragment = swap(C.lights_lambert_pars_fragment, DOTNL, TOON_DOTNL);
C.lights_physical_pars_fragment = swap(C.lights_physical_pars_fragment, DOTNL, TOON_DOTNL);

// The directional light: keep its shadow apart and give it a crisp edge, while keeping the strength
// set on the light (a shadow of strength I never goes darker than 1 - I).
{
  const start = C.lights_fragment_begin.indexOf('#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )');
  const end = C.lights_fragment_begin.indexOf('#if ( NUM_RECT_AREA_LIGHTS > 0 )');
  if (start < 0 || end < start) throw new Error('toon: lights_fragment_begin changed');
  let dir = C.lights_fragment_begin.slice(start, end);
  dir = swap(dir, 'directLight.color *= ( directLight.visible && receiveShadow ) ?', 'toonShadow = ( directLight.visible && receiveShadow ) ?');
  dir = swap(dir, '\t\t#endif\n\t\tRE_Direct( directLight,', `\t\t{ float I = max( directionalLightShadow.shadowIntensity, 1e-3 );
		  toonShadow = mix( 1.0 - I, 1.0, smoothstep( 0.12, 0.88, ( toonShadow - ( 1.0 - I ) ) / I ) ); }
		#endif
		toonIsSun = true;
		RE_Direct( directLight,`);
  dir = swap(dir, '\t}\n\t#pragma unroll_loop_end', '\t\ttoonIsSun = false; toonShadow = 1.0;\n\t}\n\t#pragma unroll_loop_end');
  C.lights_fragment_begin = C.lights_fragment_begin.slice(0, start) + dir + C.lights_fragment_begin.slice(end);
}

// Cool shade: where the sun does not reach, the ambient light leans toward the sky colour's hue.
C.lights_fragment_end += /* glsl */`
{
	#if ( NUM_HEMI_LIGHTS > 0 )
		vec3 toonTint = hemisphereLights[ 0 ].skyColor;
	#else
		vec3 toonTint = vec3( 0.32, 0.45, 0.75 );
	#endif
	const vec3 toonLuma = vec3( 0.2126, 0.7152, 0.0722 );
	toonTint /= max( dot( toonTint, toonLuma ), 1e-4 );
	vec3 toonCool = toonTint * dot( reflectedLight.indirectDiffuse, toonLuma );
	reflectedLight.indirectDiffuse = mix( reflectedLight.indirectDiffuse, toonCool, ( 1.0 - toonSunLit ) * ${TOON_COOL.toFixed(2)} );
}
`;

// Aerial perspective: distant things lose some colour before they fade into the haze.
C.fog_fragment = swap(C.fog_fragment, 'gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );',
  `gl_FragColor.rgb = mix( gl_FragColor.rgb, vec3( dot( gl_FragColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) ), fogFactor * ${TOON_HAZE_DESAT.toFixed(2)} );
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );`);

export const TOON = true;
