//Content Script - Adapted from WesternRMP
function scanPageForProfessors() {
    // Look for instructor cells in Banner system
    const instructorCells = document.querySelectorAll('td[xe-field="instructor"]');
    console.log(`Found ${instructorCells.length} instructor cells`);
    
    instructorCells.forEach(cell => {
        const professorNames = extractProfessorNames(cell);
        const department = extractDepartment();

        professorNames.forEach(name => {
            if (name && name.trim() && isValidProfessorName(name)) {
                console.log(`Found professor: ${name}`);
                displayProfessorRating(cell, name, department);
            }
        });
    });
}

function isValidProfessorName(name) {
    const cleanName = name.trim().toLowerCase();
    
    // Exclude common non-professor terms
    const excludeTerms = [
        'staff', 'teaching', 'tba', 'instructor', 'professor', 'introduction', 
        'accounting', 'financial', 'business', 'management', 'economics', 
        'finance', 'marketing', 'analysis', 'principles', 'fundamentals', 
        'advanced', 'intermediate', 'basic', 'theory', 'practice', 'application',
        'methods', 'systems', 'concepts', 'overview', 'survey', 'linear', 
        'integrated', 'applied'
    ];
    
    // Reject if contains excluded terms
    if (excludeTerms.some(term => cleanName.includes(term))) {
        return false;
    }
    
    // Must be reasonable length
    if (cleanName.length < 5 || cleanName.length > 50) {
        return false;
    }
    
    // Must have proper name format (comma or space separated)
    const hasComma = cleanName.includes(',');
    const hasSpace = cleanName.includes(' ');
    
    if (!hasComma && !hasSpace) {
        return false;
    }
    
    // Only letters, spaces, commas, hyphens, apostrophes
    if (!/^[a-zA-Z\s,'-]+$/.test(cleanName)) {
        return false;
    }
    
    return true;
}

function extractDepartment() {
    // Try to find department from course subject
    const subjectElements = document.querySelectorAll('td[xe-field="subject"]');
    if (subjectElements.length > 0) {
        return subjectElements[0].textContent.trim();
    }
    
    // Fallback: look for course info
    const courseInfo = document.querySelector('.course-info, .subject-course');
    if (courseInfo) {
        return courseInfo.textContent.trim().split(' ')[0];
    }
    
    return ""; // if no dept found
}

function extractProfessorNames(cell) {
    const names = [];
    
    // Look for links first (like "Asante-Appiah, Bright")
    const links = cell.querySelectorAll('a');
    links.forEach(link => {
        const name = link.textContent.trim();
        if (name && isValidProfessorName(name)) {
            names.push(name);
        }
    });
    
    // If no links found, check text content
    if (names.length === 0) {
        const textContent = cell.textContent.trim();
        if (textContent && isValidProfessorName(textContent)) {
            names.push(textContent);
        }
    }
    
    return names;
}

function getProfessorData(professorName, department) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            action: "searchProfessor",
            professorName: professorName,
            department: department
        }, response => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
                return;
            }
            
            if (response && response.success) {
                resolve(response.professor);
            } else {
                reject(new Error(response?.error || "Unknown error"));
            }
        });
    });
}

async function displayProfessorRating(professorCell, professorName, department) {
    try {
        const professorData = await getProfessorData(professorName, department);
        console.log(`Professor ${professorName} data:`, professorData.node);
        const data = professorData.node;

        const avgRating = data.avgRatingRounded ? data.avgRatingRounded.toFixed(1) : 'N/A';
        
        // Create a unique ID for this professor's tooltip
        const professorId = `prof_${Math.random().toString(36).substr(2, 9)}`;
        
        // Get professor details for tooltip
        const fullName = `${data.firstName} ${data.lastName}`;
        const numRatings = data.numRatings || 0;
        const wouldTakeAgain = data.wouldTakeAgainPercentRounded !== null 
            ? `${data.wouldTakeAgainPercentRounded.toFixed(1)}%` 
            : 'N/A';
        const avgDifficulty = data.avgDifficultyRounded ? data.avgDifficultyRounded.toFixed(1) : 'N/A';
        const profDepartment = data.department || department || 'N/A';
        
        // Get most useful rating if available
        let mostUsefulRatingHTML = '<p>No ratings available</p>';
        if (data.mostUsefulRating) {
            const rating = data.mostUsefulRating;
            const date = rating.date ? new Date(rating.date).toLocaleDateString() : 'Unknown date';
            const comment = rating.comment || 'No comment provided';
            const course = rating.class || 'Unknown course';
            const quality = rating.qualityRating || 'N/A';
            
            mostUsefulRatingHTML = `
                <div class="most-useful-rating">
                    <p><strong>Course:</strong> ${course}</p>
                    <p><strong>Rating:</strong> ${quality}/5 (${date})</p>
                    <p><strong>Comment:</strong> "${comment.substring(0, 150)}${comment.length > 150 ? '...' : ''}"</p>
                </div>
            `;
        }
        
        // Top tags
        let tagsHTML = '';
        if (data.teacherRatingTags && data.teacherRatingTags.length > 0) {
            const topTags = data.teacherRatingTags
                .sort((a, b) => b.tagCount - a.tagCount)
                .slice(0, 3);
                
            tagsHTML = `
                <div class="top-tags">
                    <p><strong>Top Tags:</strong> ${topTags.map(tag => tag.tagName).join(', ')}</p>
                </div>
            `;
        }
        
        // Create the rating badge and tooltip as DOM elements instead of innerHTML
        const originalContent = professorCell.innerHTML;
        
        // Create the rating badge
        const ratingBadge = document.createElement('span');
        ratingBadge.id = professorId;
        ratingBadge.textContent = avgRating;
        ratingBadge.style.cssText = `
            background-color: ${getRatingColor(avgRating)};
            color: white;
            padding: 2px 4px;
            border-radius: 3px;
            font-size: 10px;
            font-weight: bold;
            margin-left: 5px;
            cursor: pointer;
            position: relative;
            border-bottom: 1px dotted #666;
        `;
        
        // Create the tooltip
        const tooltip = document.createElement('div');
        tooltip.id = professorId + '_tooltip';
        tooltip.style.cssText = `
            display: none;
            position: fixed;
            bottom: auto;
            top: auto;
            left: auto;
            right: auto;
            width: 400px;
            max-width: 90vw;
            background-color: white;
            border: 1px solid #ccc;
            border-radius: 4px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.25);
            padding: 15px;
            z-index: 99999;
            font-size: 14px;
            color: #333;
            font-family: Arial, sans-serif;
            line-height: 1.4;
        `;
        
        tooltip.innerHTML = `
            <div class="tooltip-header" style="margin-bottom:8px; border-bottom:1px solid #eee; padding-bottom:8px;">
                <h3 style="margin:0; font-size:16px;">${fullName} </h3>
                <p style="margin:4px 0 0 0; color:#666;">${profDepartment}</p>
                <p style="margin:4px 0 0 0; color:#49a63f;">Click rating to see full profile!</p>
            </div>
            <div class="tooltip-body">
                <div class="rating-stats" style="display:flex; justify-content:space-between; margin-bottom:10px;">
                    <div>
                        <p style="margin:0;"><strong>Overall:</strong> <span style="color:#2196F3; font-weight:bold;">${avgRating}/5</span></p>
                        <p style="margin:4px 0 0 0;"><strong>Difficulty:</strong> ${avgDifficulty}/5</p>
                    </div>
                    <div>
                        <p style="margin:0;"><strong>Would take again:</strong> ${wouldTakeAgain}</p>
                        <p style="margin:4px 0 0 0;"><strong>Total ratings:</strong> ${numRatings}</p>
                    </div>
                </div>
                ${tagsHTML}
                <div class="most-useful" style="margin-top:10px; border-top:1px solid #eee; padding-top:8px;">
                    <h4 style="margin:0 0 8px 0; font-size:15px; font-weight:bold; color:#2196F3;">Most Helpful Rating</h4>
                    ${mostUsefulRatingHTML}
                </div>
            </div>
            <div class="tooltip-footer" style="margin-top:8px; font-size:12px; color:#666; text-align:left;">
                <p style="margin:0;">Data from RateMyProfessors.com</p>
            </div>
            <div class="tooltip-arrow" style="
                position: absolute;
                width: 0;
                height: 0;
                border-left: 10px solid transparent;
                border-right: 10px solid transparent;
                border-top: 10px solid white;
                bottom: -10px;
                left: 50%;
                transform: translateX(-50%);
            "></div>
            <div class="tooltip-arrow-border" style="
                position: absolute;
                width: 0;
                height: 0;
                border-left: 11px solid transparent;
                border-right: 11px solid transparent;
                border-top: 11px solid #ccc;
                bottom: -11px;
                left: 50%;
                transform: translateX(-50%);
                z-index: -1;
            "></div>
        `;
        
        // Add event listeners with positioning ABOVE the badge
        ratingBadge.addEventListener('mouseenter', (e) => {
            // Force a reflow and wait a moment to ensure we get the exact badge position
            setTimeout(() => {
                const badgeRect = ratingBadge.getBoundingClientRect();
                
                console.log('Badge position:', badgeRect); // Debug logging
                
                const tooltipWidth = 400;
                const tooltipHeight = 350; // Increased to account for actual content
                
                // Position tooltip ABOVE the badge by default, centered on the badge
                let left = badgeRect.left + (badgeRect.width / 2) - (tooltipWidth / 2);
                let top = badgeRect.top - tooltipHeight - 80; // Gap between tooltip and badge
                
                // Keep tooltip on screen horizontally
                if (left < 10) left = 10;
                if (left + tooltipWidth > window.innerWidth - 10) {
                    left = window.innerWidth - tooltipWidth - 10;
                }
                
                // Calculate arrow position relative to badge center
                const badgeCenterX = badgeRect.left + (badgeRect.width / 2);
                const arrowLeft = badgeCenterX - left;
                const arrowLeftPercent = Math.max(10, Math.min(90, (arrowLeft / tooltipWidth) * 100));
                
                // If there's no room above, show below
                if (top < 10) {
                    top = badgeRect.bottom + 10;
                    // Update arrow to point up instead of down
                    const arrow = tooltip.querySelector('.tooltip-arrow');
                    const arrowBorder = tooltip.querySelector('.tooltip-arrow-border');
                    arrow.style.cssText = `
                        position: absolute;
                        width: 0;
                        height: 0;
                        border-left: 10px solid transparent;
                        border-right: 10px solid transparent;
                        border-bottom: 10px solid white;
                        top: -10px;
                        left: ${arrowLeftPercent}%;
                        transform: translateX(-50%);
                    `;
                    arrowBorder.style.cssText = `
                        position: absolute;
                        width: 0;
                        height: 0;
                        border-left: 11px solid transparent;
                        border-right: 11px solid transparent;
                        border-bottom: 11px solid #ccc;
                        top: -11px;
                        left: ${arrowLeftPercent}%;
                        transform: translateX(-50%);
                        z-index: -1;
                    `;
                } else {
                    // Tooltip is already positioned above, just configure the arrow
                    
                    // Reset arrow to point down (default)
                    const arrow = tooltip.querySelector('.tooltip-arrow');
                    const arrowBorder = tooltip.querySelector('.tooltip-arrow-border');
                    arrow.style.cssText = `
                        position: absolute;
                        width: 0;
                        height: 0;
                        border-left: 10px solid transparent;
                        border-right: 10px solid transparent;
                        border-top: 10px solid white;
                        bottom: -10px;
                        left: ${arrowLeftPercent}%;
                        transform: translateX(-50%);
                    `;
                    arrowBorder.style.cssText = `
                        position: absolute;
                        width: 0;
                        height: 0;
                        border-left: 11px solid transparent;
                        border-right: 11px solid transparent;
                        border-top: 11px solid #ccc;
                        bottom: -11px;
                        left: ${arrowLeftPercent}%;
                        transform: translateX(-50%);
                        z-index: -1;
                    `;
                }
                
                console.log('Tooltip position:', { left, top, arrowLeftPercent }); // Debug logging
                
                tooltip.style.left = left + 'px';
                tooltip.style.top = top + 'px';
                tooltip.style.display = 'block';
            }, 10); // Small delay to ensure DOM is settled
        });
        
        ratingBadge.addEventListener('mouseleave', () => {
            tooltip.style.display = 'none';
        });
        
        // Also hide tooltip when mouse enters it (prevents flickering)
        tooltip.addEventListener('mouseenter', () => {
            tooltip.style.display = 'block';
        });
        
        tooltip.addEventListener('mouseleave', () => {
            tooltip.style.display = 'none';
        });
        
        ratingBadge.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            window.open(`https://www.ratemyprofessors.com/professor/${data.legacyId}`, '_blank');
        });
        
        // Add elements to the cell and document
        professorCell.innerHTML = originalContent;
        professorCell.appendChild(ratingBadge);
        document.body.appendChild(tooltip); // Append tooltip to body to avoid table constraints
        
        console.log('Updated cell with tooltip using DOM elements');
        console.log(`✓ Rating added for ${professorName}: ${avgRating}`);
        
    } catch (error) {
        console.error(`Error getting rating for ${professorName}:`, error);
    }
}

function getRatingColor(rating) {
    rating = parseFloat(rating);
    if (isNaN(rating)) return '#999'; // gray for N/A
    
    if (rating >= 4.5) return '#4CAF50'; // green
    if (rating >= 3.5) return '#8BC34A'; // light green
    if (rating >= 2.5) return '#FFC107'; // amber
    if (rating >= 1.5) return '#FF9800'; // orange
    return '#F44336'; // red
}

// Run the scanner
console.log('RMP: Starting professor scan...');
scanPageForProfessors();

// Watch for dynamic content changes
const observer = new MutationObserver((mutations) => {
    let shouldRescan = false;
    
    mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    if (node.matches && (
                        node.matches('td[xe-field="instructor"]') ||
                        node.querySelector('td[xe-field="instructor"]')
                    )) {
                        shouldRescan = true;
                    }
                }
            });
        }
    });
    
    if (shouldRescan) {
        console.log('RMP: Content changed, rescanning...');
        setTimeout(scanPageForProfessors, 1000);
    }
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});
