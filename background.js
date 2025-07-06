// LehighRMP Background Script - Adapted from WesternRMP

const GRAPHQL_URL = 'https://www.ratemyprofessors.com/graphql';
const LEHIGH_SCHOOL_ID = '509'; // Lehigh University's RMP ID
const AUTH_TOKEN = 'Basic dGVzdDp0ZXN0';

// Convert professor name format for better search results
const convertProfessorName = (professorName) => {
    if (!professorName || typeof professorName !== 'string') {
        return '';
    }
    
    const cleaned = professorName.trim().replace(/\(Primary\)/i, '').trim();
    console.log(`Converting name: "${cleaned}"`);
    
    // Handle "Last, First Middle" format (like "Asante-Appiah, Bright")
    if (cleaned.includes(',')) {
        const [last, firstMiddle] = cleaned.split(',').map(s => s.trim());
        const firstParts = firstMiddle.split(' ').filter(p => p.length > 0);
        if (firstParts.length > 0) {
            // Keep the full hyphenated last name
            const converted = `${firstParts[0]} ${last}`;
            console.log(`Converted comma format: "${cleaned}" -> "${converted}"`);
            return converted;
        }
    }
    
    // Handle "First Last" format (like "Tang Leo" when displayed as "Leo Tang")
    const parts = cleaned.split(' ').filter(p => p.length > 0);
    if (parts.length >= 2) {
        const firstName = parts[0];
        const lastName = parts.slice(1).join(' '); // Join all parts after first as last name (handles hyphenated names)
        const converted = `${firstName} ${lastName}`;
        console.log(`Converted space format: "${cleaned}" -> "${converted}"`);
        return converted;
    }
    
    console.log(`No conversion needed: "${cleaned}"`);
    return cleaned;
};

// Encode school ID to base64 with "School-" prefix
function encodeToBase64(str) {
    if (!str || typeof str !== 'string') {
        return '';
    }
    str = 'School-'.concat(str);
    return btoa(str);
}

// Filter professor results to find best match
const filterProfessorResults = (edges, professorName, targetDepartment) => {
    console.log(`Filtering results for: "${professorName}"`);
    console.log(`Available professors:`, edges.map(e => `${e.node.firstName} ${e.node.lastName}`));
    
    const nameParts = professorName.trim().split(/\s+/);
    if (nameParts.length < 2) return null;
    
    const searchFirstName = nameParts[0].toLowerCase();
    const searchLastName = nameParts.slice(1).join(' ').toLowerCase(); // Handle hyphenated last names
    
    console.log(`Looking for: First="${searchFirstName}", Last="${searchLastName}"`);
    
    let nameMatches = edges.filter(edge => {
        const professor = edge.node;
        const profFirstName = professor.firstName?.toLowerCase() || '';
        const profLastName = professor.lastName?.toLowerCase() || '';
        
        console.log(`Checking: "${profFirstName}" "${profLastName}"`);
        
        // Check first name match (exact, starts with, or initial)
        const firstNameMatch = 
            profFirstName === searchFirstName ||
            profFirstName.startsWith(searchFirstName) ||
            searchFirstName.startsWith(profFirstName) ||
            (searchFirstName.length === 1 && profFirstName.startsWith(searchFirstName));
        
        // Check last name match (exact, contains, or handles hyphenated names)
        const lastNameMatch = 
            profLastName === searchLastName ||
            profLastName.includes(searchLastName) ||
            searchLastName.includes(profLastName) ||
            // Handle hyphenated names by checking individual parts
            (searchLastName.includes('-') && searchLastName.split('-').some(part => 
                profLastName.includes(part) || part.includes(profLastName)
            )) ||
            (profLastName.includes('-') && profLastName.split('-').some(part => 
                searchLastName.includes(part) || part.includes(searchLastName)
            ));
        
        const isMatch = firstNameMatch && lastNameMatch;
        console.log(`Match result: first=${firstNameMatch}, last=${lastNameMatch}, overall=${isMatch}`);
        
        return isMatch;
    });
    
    console.log(`Found ${nameMatches.length} name matches`);
    
    if (nameMatches.length === 1) {
        return nameMatches[0];
    }
    
    // If multiple matches, try to filter by department
    if (nameMatches.length > 1 && targetDepartment) {
        console.log(`Filtering by department: "${targetDepartment}"`);
        const deptMatches = nameMatches.filter(edge => {
            const profDept = edge.node.department?.toLowerCase() || '';
            const targetDept = targetDepartment.toLowerCase();
            return profDept.includes(targetDept) || targetDept.includes(profDept);
        });
        if (deptMatches.length > 0) {
            console.log(`Found department match`);
            return deptMatches[0];
        }
    }
    
    const result = nameMatches.length > 0 ? nameMatches[0] : null;
    console.log(`Final result:`, result ? `${result.node.firstName} ${result.node.lastName}` : 'null');
    return result;
};

const searchProfessor = async (professorName, schoolID, targetDepartment) => {
    const query = `query NewSearchTeachersQuery(
    $query: TeacherSearchQuery!) {
        newSearch {
            teachers(query: $query) {
                didFallback
                edges {
                    cursor
                    node {
                        id
                        legacyId
                        firstName
                        lastName
                        avgRatingRounded
                        numRatings
                        wouldTakeAgainPercentRounded
                        wouldTakeAgainCount
                        teacherRatingTags {
                            id
                            legacyId
                            tagCount
                            tagName
                        }
                        mostUsefulRating {
                            id
                            class
                            isForOnlineClass
                            legacyId
                            comment
                            helpfulRatingRounded
                            ratingTags
                            grade
                            date
                            iWouldTakeAgain
                            qualityRating
                            difficultyRatingRounded
                            teacherNote{
                                id
                                comment
                                createdAt
                                class
                            }
                            thumbsDownTotal
                            thumbsUpTotal
                        }
                        avgDifficultyRounded
                        school {
                            name
                            id
                        }
                        department
                    }
                }
            }
        }
    }`;
    
    try {
        console.log(`Searching for professor: ${professorName} in ${targetDepartment}`);
        
        const response = await fetch(GRAPHQL_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': AUTH_TOKEN,
                'Accept': 'application/json',
                'Origin': 'https://www.ratemyprofessors.com'
            },
            body: JSON.stringify({
                query: query,
                variables: {
                    query: {
                        text: convertProfessorName(professorName),
                        schoolID: schoolID
                    }
                }
            })
        });
        
        if (!response.ok) {
            console.error(`API request failed with status: ${response.status}`);
            return null;
        }
        
        const data = await response.json();
        
        if (!data || !data.data) {
            console.error('API response missing data property:', data);
            return null;
        }
        
        if (!data.data.newSearch || !data.data.newSearch.teachers) {
            console.error('API response missing newSearch.teachers:', data.data);
            return null;
        }
        
        const edges = data.data.newSearch.teachers.edges;
        console.log("API response:", edges);
        
        if (edges.length === 0) {
            console.log(`No results found for professor: ${professorName}`);
            return null;
        }
        
        const professor = filterProfessorResults(edges, convertProfessorName(professorName), targetDepartment);
        console.log(`Found professor data:`, professor);
        return professor;

    } catch (error) {
        console.error('Error searching for professor:', error);
        return null;
    }
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Background received message:", message);
    
    if (message.action === "searchProfessor") {
        const { professorName, schoolID = encodeToBase64(LEHIGH_SCHOOL_ID), department } = message;
        console.log(`Processing search request for: ${professorName}, department: ${department}`);
        
        if (!professorName) {
            console.error("Missing professor name in request");
            sendResponse({ success: false, error: "Professor name is required" });
            return true;
        }
        
        searchProfessor(professorName, schoolID, department)
            .then(professorData => {
                if (professorData) {
                    console.log(`Sending successful response for ${professorName}`);
                    sendResponse({ success: true, professor: professorData });
                } else {
                    console.log(`Professor not found: ${professorName}`);
                    sendResponse({ 
                        success: false, 
                        error: "Professor not found",
                        searchTerm: professorName,
                        convertedName: convertProfessorName(professorName)
                    });
                }
            })
            .catch(error => {
                console.error(`Error in searchProfessor for ${professorName}:`, error);
                sendResponse({ 
                    success: false, 
                    error: "Error searching for professor: " + error.message 
                });
            });
        
        return true; // indicates we send a response asynchronously
    }
    
    return false;
});

console.log("LehighRMP Background script loaded, listening.");