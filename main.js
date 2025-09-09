import * as THREE from 'three';

const vertexShader = `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const fragmentShader = `
    varying vec2 vUv;
    uniform sampler2D uTexture;
    uniform vec2 uResolution;
    
    uniform vec3 uColorFace;
    uniform vec3 uColorArmour;
    uniform vec3 uColorTrim;
    uniform vec3 uColorHair;
    uniform vec3 uColorOutline;

    uniform float uThresholdFace;
    uniform float uThresholdArmour;
    uniform float uThresholdTrim;
    uniform float uThresholdHair;
    uniform float uThresholdOutline;

    uniform bool uCleanPixels;
    uniform float uAmbiguityThreshold;

    // Lighting uniforms
    uniform vec3 uLightPos;
    uniform vec3 uLightColor;
    uniform vec3 uAmbientColor;
    uniform float uLightIntensity;
    uniform float uSpecularIntensity;

    // Palette based on the new source image
    const vec3 PALETTE_FACE    = vec3(1.0, 1.0, 0.0); // Yellow
    const vec3 PALETTE_ARMOUR  = vec3(0.0, 0.0, 1.0); // Blue
    const vec3 PALETTE_TRIM    = vec3(0.0, 1.0, 0.0); // Green
    const vec3 PALETTE_HAIR    = vec3(1.0, 0.0, 0.0); // Red
    const vec3 PALETTE_OUTLINE = vec3(0.0, 0.0, 0.0); // Black

    struct Classification {
        int index;
        float distance;
    };

    Classification classify_pixel(vec2 uv) {
        vec4 texColor = texture2D(uTexture, uv);
        if (texColor.a < 0.5) {
            return Classification(-1, 10.0);
        }

        vec3 colors[5];
        colors[0] = PALETTE_FACE;
        colors[1] = PALETTE_ARMOUR;
        colors[2] = PALETTE_TRIM;
        colors[3] = PALETTE_HAIR;
        colors[4] = PALETTE_OUTLINE;
        
        float min_dist = 10.0;
        int min_idx = -1;

        for (int i = 0; i < 5; i++) {
            float d = distance(texColor.rgb, colors[i]);
            if (d < min_dist) {
                min_dist = d;
                min_idx = i;
            }
        }
        return Classification(min_idx, min_dist);
    }

    vec3 LUMINANCE_VECTOR = vec3(0.2126, 0.7152, 0.0722);

    float getLuminance(vec3 color) {
        return dot(color, LUMINANCE_VECTOR);
    }

    float getTextureLuminance(vec2 uv) {
        vec4 color = texture2D(uTexture, uv);
        if (color.a < 0.5) return 0.0;
        return getLuminance(color.rgb);
    }

    void main() {
        vec2 onePixel = 1.0 / uResolution;
        vec4 texColor = texture2D(uTexture, vUv);

        if (uCleanPixels) {
            float alpha = texColor.a;
            float n = texture2D(uTexture, vUv + vec2(0.0, onePixel.y)).a;
            float s = texture2D(uTexture, vUv - vec2(0.0, onePixel.y)).a;
            float e = texture2D(uTexture, vUv + vec2(onePixel.x, 0.0)).a;
            float w = texture2D(uTexture, vUv - vec2(onePixel.x, 0.0)).a;
            
            if (alpha > 0.5 && n < 0.1 && s < 0.1 && e < 0.1 && w < 0.1) {
                alpha = 0.0;
            }

            if (alpha < 0.1) {
                discard;
            }
        } else {
             if (texColor.a < 0.1) {
                discard;
            }
        }
       
        vec3 finalColor = texColor.rgb;

        Classification center_class = classify_pixel(vUv);
        int final_idx = center_class.index;

        if (center_class.distance > uAmbiguityThreshold && center_class.index != -1) {
            // Pixel is ambiguous, check neighbors
            vec2 onePixel = 1.0 / uResolution;
            Classification n_class = classify_pixel(vUv + vec2(0.0, onePixel.y));
            Classification s_class = classify_pixel(vUv - vec2(0.0, onePixel.y));
            Classification e_class = classify_pixel(vUv + vec2(onePixel.x, 0.0));
            Classification w_class = classify_pixel(vUv - vec2(onePixel.x, 0.0));
            
            int votes[5];
            votes[0] = 0; votes[1] = 0; votes[2] = 0; votes[3] = 0; votes[4] = 0;

            if (n_class.index != -1) votes[n_class.index]++;
            if (s_class.index != -1) votes[s_class.index]++;
            if (e_class.index != -1) votes[e_class.index]++;
            if (w_class.index != -1) votes[w_class.index]++;
            
            int max_votes = 0;
            int majority_idx = -1;
            for (int i = 0; i < 5; i++) {
                if (votes[i] > max_votes) {
                    max_votes = votes[i];
                    majority_idx = i;
                }
            }

            if (max_votes >= 2) { // Require at least 2 neighbors to agree
                final_idx = majority_idx;
            }
        }

        vec3 colors[5];
        colors[0] = PALETTE_FACE;
        colors[1] = PALETTE_ARMOUR;
        colors[2] = PALETTE_TRIM;
        colors[3] = PALETTE_HAIR;
        colors[4] = PALETTE_OUTLINE;

        vec3 targetColors[5];
        targetColors[0] = uColorFace;
        targetColors[1] = uColorArmour;
        targetColors[2] = uColorTrim;
        targetColors[3] = uColorHair;
        targetColors[4] = uColorOutline;

        float dists[5];
        dists[0] = distance(texColor.rgb, colors[0]);
        dists[1] = distance(texColor.rgb, colors[1]);
        dists[2] = distance(texColor.rgb, colors[2]);
        dists[3] = distance(texColor.rgb, colors[3]);
        dists[4] = distance(texColor.rgb, colors[4]);
        
        float min_dist = 10.0;
        int min_idx = final_idx;

        if (min_idx != -1) {
            min_dist = dists[min_idx];

            float threshold = 1.0;
            if(min_idx == 0) threshold = uThresholdFace;
            if(min_idx == 1) threshold = uThresholdArmour;
            if(min_idx == 2) threshold = uThresholdTrim;
            if(min_idx == 3) threshold = uThresholdHair;
            if(min_idx == 4) threshold = uThresholdOutline;

            if (min_dist < threshold) {
                vec3 paletteColor = colors[min_idx];
                vec3 targetColor = targetColors[min_idx];
                
                float texLuminance = getLuminance(texColor.rgb);
                float paletteLuminance = getLuminance(paletteColor);
                
                // Avoid division by zero for black outline
                if (paletteLuminance < 0.001) {
                    finalColor = targetColor * texLuminance;
                } else {
                    float luminanceRatio = texLuminance / paletteLuminance;
                    finalColor = targetColor * luminanceRatio;
                }
            }
        }


        // --- HD LIGHTING CALCULATION ---
        if (texColor.a > 0.5) {
            // 1. Calculate Normal from the texture's luminance (acts as a height map)
            float lum_l = getTextureLuminance(vUv - vec2(onePixel.x, 0.0));
            float lum_r = getTextureLuminance(vUv + vec2(onePixel.x, 0.0));
            float lum_b = getTextureLuminance(vUv - vec2(0.0, onePixel.y));
            float lum_t = getTextureLuminance(vUv + vec2(0.0, onePixel.y));
            
            // The Z component of the normal determines the "flatness" of the lighting effect.
            // A smaller value makes the effect more pronounced.
            vec3 normal = normalize(vec3(lum_r - lum_l, lum_t - lum_b, 0.2));

            // 2. Calculate vectors for lighting
            vec3 pixelPos = vec3(vUv, 0.0);
            vec3 lightDir = normalize(uLightPos - pixelPos);
            vec3 viewDir = vec3(0.0, 0.0, 1.0); // Orthographic camera looking down Z
            vec3 reflectDir = reflect(-lightDir, normal);

            // 3. Calculate diffuse lighting
            float diff = max(dot(normal, lightDir), 0.0);
            vec3 diffuse = diff * uLightColor;

            // 4. Calculate specular lighting (shininess)
            float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0); // 32.0 is shininess
            vec3 specular = uSpecularIntensity * spec * uLightColor;

            // 5. Combine lighting components and apply to the final color
            vec3 lighting = uAmbientColor + (diffuse * uLightIntensity) + specular;
            finalColor *= lighting;
        }

        gl_FragColor = vec4(finalColor, texColor.a);
    }
`;

// Basic setup
const canvas = document.getElementById('main-canvas');
const container = document.getElementById('canvas-container');
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
const scene = new THREE.Scene();

// Camera
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
camera.position.z = 1;

// Texture and Material
const textureLoader = new THREE.TextureLoader();
const texture = textureLoader.load('warrior.png', (loadedTexture) => {
    // Pass texture resolution to the shader
    shaderMaterial.uniforms.uResolution.value.x = loadedTexture.image.width;
    shaderMaterial.uniforms.uResolution.value.y = loadedTexture.image.height;
});
texture.magFilter = THREE.NearestFilter;
texture.minFilter = THREE.NearestFilter;

const shaderMaterial = new THREE.ShaderMaterial({
    uniforms: {
        uTexture: { value: texture },
        uResolution: { value: new THREE.Vector2(1, 1) }, // Default, will be updated on load
        uColorFace: { value: new THREE.Color('#FFFF00') },
        uColorArmour: { value: new THREE.Color('#0000FF') },
        uColorTrim: { value: new THREE.Color('#00FF00') },
        uColorHair: { value: new THREE.Color('#FF0000') },
        uColorOutline: { value: new THREE.Color('#000000') },
        uThresholdFace: { value: 1.0 },
        uThresholdArmour: { value: 1.0 },
        uThresholdTrim: { value: 1.0 },
        uThresholdHair: { value: 1.0 },
        uThresholdOutline: { value: 1.0 },
        uCleanPixels: { value: true },
        uAmbiguityThreshold: { value: 0.25 },
        // Lighting uniforms
        uLightPos: { value: new THREE.Vector3(0.5, 0.5, 0.5) },
        uLightColor: { value: new THREE.Color('#FFFFFF') },
        uAmbientColor: { value: new THREE.Color('#555555') },
        uLightIntensity: { value: 1.0 },
        uSpecularIntensity: { value: 0.5 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
});

// Geometry
const geometry = new THREE.PlaneGeometry(2, 2);
const mesh = new THREE.Mesh(geometry, shaderMaterial);
scene.add(mesh);

// Handle Resize
function resize() {
    const { clientWidth, clientHeight } = container;
    renderer.setSize(clientWidth, clientHeight, false);
    camera.updateProjectionMatrix();

    // Adjust plane to fit texture aspect ratio
    const imageAspect = 3 / 4; // width / height of the image
    const canvasAspect = clientWidth / clientHeight;
    mesh.scale.set(1, 1, 1);
    if (imageAspect > canvasAspect) {
        mesh.scale.set(1, canvasAspect / imageAspect, 1);
    } else {
        mesh.scale.set(imageAspect / canvasAspect, 1, 1);
    }
}

// Connect UI controls
const colorMappings = {
    'color-face': 'uColorFace',
    'color-armour': 'uColorArmour',
    'color-trim': 'uColorTrim',
    'color-hair': 'uColorHair',
    'color-outline': 'uColorOutline',
};

for (const [id, uniformName] of Object.entries(colorMappings)) {
    const input = document.getElementById(id);
    input.addEventListener('input', (event) => {
        shaderMaterial.uniforms[uniformName].value.set(event.target.value);
    });
}

// Connect individual slider controls
const thresholdMappings = {
    'threshold-face': 'uThresholdFace',
    'threshold-armour': 'uThresholdArmour',
    'threshold-trim': 'uThresholdTrim',
    'threshold-hair': 'uThresholdHair',
    'threshold-outline': 'uThresholdOutline',
};

for (const [id, uniformName] of Object.entries(thresholdMappings)) {
    const slider = document.getElementById(id);
    const valueSpan = document.getElementById(`threshold-value-${id.split('-')[1]}`);
    slider.addEventListener('input', (event) => {
        const threshold = parseFloat(event.target.value);
        shaderMaterial.uniforms[uniformName].value = threshold;
        if (valueSpan) {
            valueSpan.textContent = threshold.toFixed(2);
        }
    });
}

// Connect ambiguity slider
const ambiguitySlider = document.getElementById('ambiguity-slider');
const ambiguityValue = document.getElementById('ambiguity-value');
ambiguitySlider.addEventListener('input', (event) => {
    const threshold = parseFloat(event.target.value);
    shaderMaterial.uniforms.uAmbiguityThreshold.value = threshold;
    ambiguityValue.textContent = threshold.toFixed(2);
});

// Connect lighting controls
const lightColorInput = document.getElementById('color-light');
lightColorInput.addEventListener('input', (e) => {
    shaderMaterial.uniforms.uLightColor.value.set(e.target.value);
});

const ambientColorInput = document.getElementById('color-ambient');
ambientColorInput.addEventListener('input', (e) => {
    shaderMaterial.uniforms.uAmbientColor.value.set(e.target.value);
});

const lightIntensitySlider = document.getElementById('light-intensity-slider');
const lightIntensityValue = document.getElementById('light-intensity-value');
lightIntensitySlider.addEventListener('input', (e) => {
    const intensity = parseFloat(e.target.value);
    shaderMaterial.uniforms.uLightIntensity.value = intensity;
    lightIntensityValue.textContent = intensity.toFixed(2);
});

const specularIntensitySlider = document.getElementById('specular-intensity-slider');
const specularIntensityValue = document.getElementById('specular-intensity-value');
specularIntensitySlider.addEventListener('input', (e) => {
    const intensity = parseFloat(e.target.value);
    shaderMaterial.uniforms.uSpecularIntensity.value = intensity;
    specularIntensityValue.textContent = intensity.toFixed(2);
});


// Update light position with mouse movement
container.addEventListener('mousemove', (event) => {
    const rect = container.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = 1.0 - (event.clientY - rect.top) / rect.height; // Invert Y for shader coords
    shaderMaterial.uniforms.uLightPos.value.x = x;
    shaderMaterial.uniforms.uLightPos.value.y = y;
});

// Connect pixel cleanup toggle
const cleanPixelsToggle = document.getElementById('clean-pixels-toggle');
cleanPixelsToggle.addEventListener('change', (event) => {
    shaderMaterial.uniforms.uCleanPixels.value = event.target.checked;
});

// Set default color picker values to match base palette for a better starting point
document.getElementById('color-face').value = '#FFFF00';
document.getElementById('color-armour').value = '#0000FF';
document.getElementById('color-trim').value = '#00FF00';
document.getElementById('color-hair').value = '#FF0000';
document.getElementById('color-outline').value = '#000000';

// Remove old global slider logic if it's still there
const oldSliderControl = document.querySelector('.slider-control');
if (oldSliderControl && oldSliderControl.style.display !== 'none' && !oldSliderControl.querySelector('#light-intensity-slider') && !oldSliderControl.querySelector('#specular-intensity-slider')) {
    const label = oldSliderControl.querySelector('label');
    if (label && label.htmlFor === 'threshold-slider') {
         oldSliderControl.style.display = 'none';
    }
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}

// Initial setup
const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(container);
resize();
animate();